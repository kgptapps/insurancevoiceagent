class AudioService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;
  private audioChunks: Blob[] = [];
  private onAudioDataCallback: ((audioData: number[]) => void) | null = null;
  private accumulatedChunks: Blob[] = [];
  private chunkProcessingTimeout: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });

      console.log('Audio service initialized successfully');
    } catch (error) {
      console.error('Error initializing audio service:', error);
      throw new Error('Failed to access microphone. Please check permissions.');
    }
  }

  async startRecording(onAudioData: (audioData: number[]) => void): Promise<void> {
    if (!this.stream) {
      throw new Error('Audio service not initialized');
    }

    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    this.onAudioDataCallback = onAudioData;
    this.audioChunks = [];

    try {
      // Create MediaRecorder with appropriate options
      const options: MediaRecorderOptions = {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: 16000
      };

      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.accumulatedChunks.push(event.data);
          this.scheduleChunkProcessing();
        }
      };

      this.mediaRecorder.onstart = () => {
        console.log('Recording started');
        this.isRecording = true;
      };

      this.mediaRecorder.onstop = () => {
        console.log('Recording stopped');
        this.isRecording = false;
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        this.isRecording = false;
      };

      // Start recording with larger time slices for better audio decoding
      this.mediaRecorder.start(500); // 500ms chunks for better decoding

    } catch (error) {
      console.error('Error starting recording:', error);
      throw new Error('Failed to start recording');
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }

    // Clear any pending chunk processing
    if (this.chunkProcessingTimeout) {
      clearTimeout(this.chunkProcessingTimeout);
      this.chunkProcessingTimeout = null;
    }

    // Process any remaining accumulated chunks
    if (this.accumulatedChunks.length > 0) {
      this.processAccumulatedChunks();
    }
  }

  private scheduleChunkProcessing(): void {
    // Clear existing timeout
    if (this.chunkProcessingTimeout) {
      clearTimeout(this.chunkProcessingTimeout);
    }

    // Schedule processing after a short delay to accumulate more chunks
    this.chunkProcessingTimeout = setTimeout(() => {
      this.processAccumulatedChunks();
    }, 100); // 100ms delay to accumulate chunks
  }

  private async processAccumulatedChunks(): Promise<void> {
    if (this.accumulatedChunks.length === 0 || !this.onAudioDataCallback) {
      return;
    }

    try {
      // Combine all accumulated chunks into a single blob
      const combinedBlob = new Blob(this.accumulatedChunks, { type: this.accumulatedChunks[0].type });
      this.accumulatedChunks = []; // Clear accumulated chunks

      // Process the combined chunk
      await this.processAudioChunk(combinedBlob);
    } catch (error) {
      console.error('Error processing accumulated chunks:', error);
      this.accumulatedChunks = []; // Clear on error
    }
  }

  private async processAudioChunk(audioBlob: Blob): Promise<void> {
    if (!this.audioContext || !this.onAudioDataCallback) {
      return;
    }

    try {
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Try to decode audio data - skip if it fails (common with small chunks)
      try {
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Get PCM data (16-bit)
        const pcmData = this.convertToPCM16(audioBuffer);

        // Send to callback
        this.onAudioDataCallback(Array.from(pcmData));
      } catch (decodeError) {
        // Skip chunks that can't be decoded (usually too small or incomplete)
        // This is normal behavior for streaming audio chunks
        // console.debug('Skipping audio chunk that cannot be decoded:', decodeError instanceof Error ? decodeError.message : 'Unknown decode error');
      }

    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }

  private convertToPCM16(audioBuffer: AudioBuffer): Int16Array {
    const channelData = audioBuffer.getChannelData(0); // Get first channel
    const pcm16 = new Int16Array(channelData.length);
    
    for (let i = 0; i < channelData.length; i++) {
      // Convert float32 (-1 to 1) to int16 (-32768 to 32767)
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    
    return pcm16;
  }

  async playAudio(audioData: number[], format: string = 'pcm16'): Promise<void> {
    if (!this.audioContext) {
      console.error('Audio context not initialized');
      return;
    }

    console.log('Playing audio:', {
      dataLength: audioData.length,
      format,
      sampleRate: this.audioContext.sampleRate,
      contextState: this.audioContext.state
    });

    try {
      // Resume audio context if suspended (required for user interaction)
      if (this.audioContext.state === 'suspended') {
        console.log('Resuming audio context...');
        await this.audioContext.resume();
      }

      // Convert PCM16 data back to float32
      const float32Data = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        float32Data[i] = audioData[i] / (audioData[i] < 0 ? 0x8000 : 0x7FFF);
      }

      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, 16000);
      audioBuffer.getChannelData(0).set(float32Data);

      // Create and play audio source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // Add event listeners for debugging
      source.onended = () => {
        console.log('Audio playback ended');
      };

      // AudioBufferSourceNode doesn't have onerror, but we can catch errors in the try/catch

      console.log('Starting audio playback...');
      source.start();
      console.log('Audio playback started successfully');

    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/wav'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Fallback
  }

  getRecordingState(): boolean {
    return this.isRecording;
  }

  async checkMicrophonePermission(): Promise<boolean> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state === 'granted';
    } catch (error) {
      console.warn('Could not check microphone permission:', error);
      return false;
    }
  }

  cleanup(): void {
    this.stopRecording();

    // Clear any pending timeouts
    if (this.chunkProcessingTimeout) {
      clearTimeout(this.chunkProcessingTimeout);
      this.chunkProcessingTimeout = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.mediaRecorder = null;
    this.onAudioDataCallback = null;
    this.audioChunks = [];
    this.accumulatedChunks = [];
  }
}

// Create singleton instance
const audioService = new AudioService();
export default audioService;
