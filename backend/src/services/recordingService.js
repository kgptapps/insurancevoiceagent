import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
import fs from 'fs/promises';
import path from 'path';

class RecordingService {
  constructor() {
    // Local file system storage configuration
    this.recordingsDir = process.env.RECORDINGS_DIR || path.join(process.cwd(), 'local-conversations');
    this.recordings = new Map(); // In-memory storage for active recordings

    // Ensure recordings directory exists
    this.ensureRecordingsDirectory();
  }

  /**
   * Ensure the recordings directory exists
   */
  async ensureRecordingsDirectory() {
    try {
      await fs.mkdir(this.recordingsDir, { recursive: true });
      console.log(`Recordings directory ensured: ${this.recordingsDir}`);
    } catch (error) {
      console.error('Error creating recordings directory:', error);
    }
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
   * Stop recording and save to local file system
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
      // Save to local file system
      const localResults = await this.saveToLocalFileSystem(recording);

      // Clean up from memory
      this.recordings.delete(sessionId);

      console.log(`Recording completed and saved for session ${sessionId}`);
      return {
        recordingId: recording.recordingId,
        sessionId,
        localResults,
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
   * Save recording data to local file system
   */
  async saveToLocalFileSystem(recording) {
    const { recordingId, sessionId, startTime } = recording;
    const datePrefix = new Date(startTime).toISOString().split('T')[0]; // YYYY-MM-DD
    const timePrefix = new Date(startTime).toISOString().replace(/[:.]/g, '-').split('T')[1].split('Z')[0]; // HH-MM-SS-mmm

    // Create session directory
    const sessionDir = path.join(this.recordingsDir, datePrefix, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const results = {
      audioFile: null,
      transcriptFile: null,
      metadataFile: null,
      conversationFile: null
    };

    try {
      // 1. Save raw audio (concatenated chunks) as WAV
      if (recording.audioChunks.length > 0) {
        const audioBuffer = this.concatenateAudioChunks(recording.audioChunks);
        const audioFilename = `${recordingId}_${timePrefix}_audio.wav`;
        const audioPath = path.join(sessionDir, audioFilename);

        // Create WAV header for PCM16 audio
        const wavBuffer = this.createWavFile(audioBuffer, recording.audioFormat);
        await fs.writeFile(audioPath, wavBuffer);

        results.audioFile = {
          path: audioPath,
          filename: audioFilename,
          size: wavBuffer.length,
          format: 'wav'
        };
        console.log(`Saved audio file: ${audioPath}`);
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

        const transcriptFilename = `${recordingId}_${timePrefix}_transcript.json`;
        const transcriptPath = path.join(sessionDir, transcriptFilename);
        await fs.writeFile(transcriptPath, JSON.stringify(transcriptData, null, 2));

        results.transcriptFile = {
          path: transcriptPath,
          filename: transcriptFilename,
          size: Buffer.byteLength(JSON.stringify(transcriptData, null, 2))
        };
        console.log(`Saved transcript file: ${transcriptPath}`);
      }

      // 3. Save conversation as readable text file
      if (recording.transcriptSegments.length > 0) {
        const conversationText = this.generateReadableConversation(recording);
        const conversationFilename = `${recordingId}_${timePrefix}_conversation.txt`;
        const conversationPath = path.join(sessionDir, conversationFilename);
        await fs.writeFile(conversationPath, conversationText);

        results.conversationFile = {
          path: conversationPath,
          filename: conversationFilename,
          size: Buffer.byteLength(conversationText)
        };
        console.log(`Saved conversation file: ${conversationPath}`);
      }

      // 4. Save metadata
      const metadataContent = {
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
        },
        files: {
          audioFile: results.audioFile?.filename || null,
          transcriptFile: results.transcriptFile?.filename || null,
          conversationFile: results.conversationFile?.filename || null
        }
      };

      const metadataFilename = `${recordingId}_${timePrefix}_metadata.json`;
      const metadataPath = path.join(sessionDir, metadataFilename);
      await fs.writeFile(metadataPath, JSON.stringify(metadataContent, null, 2));

      results.metadataFile = {
        path: metadataPath,
        filename: metadataFilename,
        size: Buffer.byteLength(JSON.stringify(metadataContent, null, 2))
      };
      console.log(`Saved metadata file: ${metadataPath}`);

      return results;

    } catch (error) {
      console.error('Error saving to local file system:', error);
      throw new Error(`Failed to save recording to local file system: ${error.message}`);
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
