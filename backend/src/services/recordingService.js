import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';

class RecordingService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.bucketName = process.env.RECORDINGS_BUCKET || 'insurance-voice-agent-recordings-production';
    this.recordings = new Map(); // In-memory storage for active recordings
  }

  /**
   * Start a new recording session
   */
  startRecording(sessionId, metadata = {}) {
    const recordingId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const recording = {
      recordingId,
      sessionId,
      startTime: timestamp,
      endTime: null,
      status: 'recording',
      audioChunks: [],
      transcriptSegments: [],
      metadata: {
        ...metadata,
        userAgent: metadata.userAgent || 'unknown',
        ipAddress: metadata.ipAddress || 'unknown',
        sessionStartTime: timestamp
      },
      audioFormat: {
        sampleRate: 24000,
        channels: 1,
        encoding: 'pcm16'
      }
    };

    this.recordings.set(sessionId, recording);
    console.log(`Started recording for session ${sessionId}, recording ID: ${recordingId}`);
    
    return recording;
  }

  /**
   * Add audio chunk to recording
   */
  addAudioChunk(sessionId, audioData, timestamp = null) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      throw new Error(`No active recording found for session ${sessionId}`);
    }

    if (recording.status !== 'recording') {
      throw new Error(`Recording is not active for session ${sessionId}`);
    }

    const chunk = {
      id: uuidv4(),
      timestamp: timestamp || new Date().toISOString(),
      data: audioData,
      size: audioData.length,
      type: 'audio'
    };

    recording.audioChunks.push(chunk);
    console.log(`Added audio chunk to session ${sessionId}, size: ${chunk.size} bytes`);
    
    return chunk;
  }

  /**
   * Add transcript segment to recording
   */
  addTranscriptSegment(sessionId, transcript, metadata = {}) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      throw new Error(`No active recording found for session ${sessionId}`);
    }

    const segment = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      transcript,
      speaker: metadata.speaker || 'user', // 'user' or 'agent'
      confidence: metadata.confidence || null,
      startTime: metadata.startTime || null,
      endTime: metadata.endTime || null,
      type: 'transcript'
    };

    recording.transcriptSegments.push(segment);
    console.log(`Added transcript segment to session ${sessionId}: "${transcript.substring(0, 50)}..."`);
    
    return segment;
  }

  /**
   * Stop recording and save to S3
   */
  async stopRecording(sessionId, finalMetadata = {}) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      throw new Error(`No active recording found for session ${sessionId}`);
    }

    recording.endTime = new Date().toISOString();
    recording.status = 'completed';
    recording.metadata = {
      ...recording.metadata,
      ...finalMetadata,
      totalAudioChunks: recording.audioChunks.length,
      totalTranscriptSegments: recording.transcriptSegments.length,
      duration: this.calculateDuration(recording.startTime, recording.endTime)
    };

    try {
      // Save to S3
      const s3Results = await this.saveToS3(recording);
      
      // Clean up from memory
      this.recordings.delete(sessionId);
      
      console.log(`Recording completed and saved for session ${sessionId}`);
      return {
        recordingId: recording.recordingId,
        sessionId,
        s3Results,
        metadata: recording.metadata
      };
      
    } catch (error) {
      recording.status = 'error';
      recording.error = error.message;
      console.error(`Error saving recording for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Save recording data to S3
   */
  async saveToS3(recording) {
    const { recordingId, sessionId, startTime } = recording;
    const datePrefix = new Date(startTime).toISOString().split('T')[0]; // YYYY-MM-DD
    
    const results = {
      audioFile: null,
      transcriptFile: null,
      metadataFile: null
    };

    try {
      // 1. Save raw audio (concatenated chunks)
      if (recording.audioChunks.length > 0) {
        const audioBuffer = this.concatenateAudioChunks(recording.audioChunks);
        const audioKey = `recordings/${datePrefix}/${sessionId}/${recordingId}_audio.wav`;
        
        await this.uploadToS3(audioKey, audioBuffer, 'audio/wav');
        results.audioFile = {
          key: audioKey,
          size: audioBuffer.length,
          url: `s3://${this.bucketName}/${audioKey}`
        };
      }

      // 2. Save transcript as JSON
      if (recording.transcriptSegments.length > 0) {
        const transcriptData = {
          recordingId,
          sessionId,
          startTime: recording.startTime,
          endTime: recording.endTime,
          segments: recording.transcriptSegments,
          fullTranscript: this.generateFullTranscript(recording.transcriptSegments)
        };
        
        const transcriptKey = `recordings/${datePrefix}/${sessionId}/${recordingId}_transcript.json`;
        const transcriptBuffer = Buffer.from(JSON.stringify(transcriptData, null, 2));
        
        await this.uploadToS3(transcriptKey, transcriptBuffer, 'application/json');
        results.transcriptFile = {
          key: transcriptKey,
          size: transcriptBuffer.length,
          url: `s3://${this.bucketName}/${transcriptKey}`
        };
      }

      // 3. Save metadata
      const metadataKey = `recordings/${datePrefix}/${sessionId}/${recordingId}_metadata.json`;
      const metadataBuffer = Buffer.from(JSON.stringify({
        recordingId,
        sessionId,
        startTime: recording.startTime,
        endTime: recording.endTime,
        status: recording.status,
        metadata: recording.metadata,
        audioFormat: recording.audioFormat,
        statistics: {
          totalAudioChunks: recording.audioChunks.length,
          totalTranscriptSegments: recording.transcriptSegments.length,
          totalAudioSize: recording.audioChunks.reduce((sum, chunk) => sum + chunk.size, 0),
          duration: recording.metadata.duration
        }
      }, null, 2));
      
      await this.uploadToS3(metadataKey, metadataBuffer, 'application/json');
      results.metadataFile = {
        key: metadataKey,
        size: metadataBuffer.length,
        url: `s3://${this.bucketName}/${metadataKey}`
      };

      return results;
      
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw new Error(`Failed to save recording to S3: ${error.message}`);
    }
  }

  /**
   * Upload data to S3
   */
  async uploadToS3(key, data, contentType) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'service': 'insurance-voice-agent'
      }
    });

    const result = await this.s3Client.send(command);
    console.log(`Uploaded to S3: s3://${this.bucketName}/${key}`);
    return result;
  }

  /**
   * Concatenate audio chunks into a single buffer
   */
  concatenateAudioChunks(chunks) {
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const concatenated = Buffer.alloc(totalSize);
    
    let offset = 0;
    for (const chunk of chunks) {
      const chunkBuffer = Buffer.isBuffer(chunk.data) ? chunk.data : Buffer.from(chunk.data);
      chunkBuffer.copy(concatenated, offset);
      offset += chunkBuffer.length;
    }
    
    return concatenated;
  }

  /**
   * Generate full transcript from segments
   */
  generateFullTranscript(segments) {
    return segments
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(segment => `[${segment.timestamp}] ${segment.speaker}: ${segment.transcript}`)
      .join('\n');
  }

  /**
   * Calculate duration between two timestamps
   */
  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    
    return {
      milliseconds: durationMs,
      seconds: Math.round(durationMs / 1000),
      formatted: this.formatDuration(durationMs)
    };
  }

  /**
   * Format duration as HH:MM:SS
   */
  formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get recording status
   */
  getRecordingStatus(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return null;
    }

    return {
      recordingId: recording.recordingId,
      sessionId: recording.sessionId,
      status: recording.status,
      startTime: recording.startTime,
      endTime: recording.endTime,
      audioChunks: recording.audioChunks.length,
      transcriptSegments: recording.transcriptSegments.length
    };
  }

  /**
   * List all active recordings
   */
  getActiveRecordings() {
    return Array.from(this.recordings.values()).map(recording => ({
      recordingId: recording.recordingId,
      sessionId: recording.sessionId,
      status: recording.status,
      startTime: recording.startTime,
      audioChunks: recording.audioChunks.length,
      transcriptSegments: recording.transcriptSegments.length
    }));
  }

  /**
   * Cancel recording (without saving)
   */
  cancelRecording(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      throw new Error(`No active recording found for session ${sessionId}`);
    }

    recording.status = 'cancelled';
    recording.endTime = new Date().toISOString();
    
    this.recordings.delete(sessionId);
    console.log(`Recording cancelled for session ${sessionId}`);
    
    return {
      recordingId: recording.recordingId,
      sessionId,
      status: 'cancelled'
    };
  }
}

// Create singleton instance
const recordingService = new RecordingService();
export default recordingService;
