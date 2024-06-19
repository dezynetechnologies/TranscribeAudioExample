// app.component.ts

import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  status: string = '';
  transcript: string = '';
  isModelLoading: boolean = false;
  isTranscribing: boolean = false;
  loadingProgress: number = 0;
  audioData: Float32Array | null = null;
  worker: Worker;
  result: string | null = null;
  isBusy: boolean = false;
  private mediaRecorder: MediaRecorder | undefined;
  private audioChunks: Blob[] = [];
  public isRecording: boolean = false;
  public buttonLabel: string = 'Start Recording';

  constructor() {
    this.worker = new Worker(new URL('../../public/worker.js', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event) => {
      const { type, progress, transcript, error } = event.data;
      if (type === 'modelProgress') {
        this.loadingProgress = progress;
      } else if (type === 'modelLoaded') {
        this.isModelLoading = false;
        console.log('Model loaded successfully');
      } else if (type === 'transcriptionComplete') {
        this.isTranscribing = false;
        this.result = transcript;
        console.log('Transcription complete:', this.result);
      } else if (type === 'error') {
        console.error('Error:', error);
        this.isModelLoading = false;
        this.isTranscribing = false;
      }
    };

    //this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  ngOnInit(): void {
    this.loadModel();
    //this.loadAndTranscribeAudioFile('../../public/jfk.wav');
  }

  loadModel(): void {
    this.isModelLoading = true;
    this.loadingProgress = 0;
    this.worker.postMessage({ model: 'Xenova/whisper-tiny', multilingual: false, quantized: false, subtask: 'transcribe', language: 'english' });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.readFile(file);
    }
  }

  readFile(file: File): void {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      console.log(arrayBuffer);
      if (!arrayBuffer) return;

      await this.processArrayBuffer(arrayBuffer);
    };
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
    };
    reader.readAsArrayBuffer(file);
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = []; // Clear previous audio chunks
        this.mediaRecorder.ondataavailable = event => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };
        this.mediaRecorder.start();
        this.isRecording = true;
        this.buttonLabel = 'Stop Recording';
      })
      .catch(error => console.error('Error accessing microphone:', error));
  }

  stopRecording() {
    if(this.mediaRecorder){
      this.mediaRecorder.stop();
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsArrayBuffer(audioBlob);
        reader.onloadend = () => {
          if (reader.result && typeof reader.result !== 'string') {
            console.log(reader.result);
            this.processArrayBuffer(reader.result as ArrayBuffer);
          } else {
            console.error('Error reading audio data');
          }
        };
      };
    }
    this.isRecording = false;
    this.buttonLabel = 'Start Recording';
  }

  async processArrayBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    const audioCTX = new AudioContext({
      sampleRate: 16000,
    });
    try {
      const audioBuffer = await audioCTX.decodeAudioData(arrayBuffer);
      console.log(audioBuffer)
      this.transcribe(audioBuffer);
    } catch (error) {
      console.error('Error decoding audio data:', error);
    }
  }

  async transcribe(audioData: AudioBuffer) {
    this.isBusy = true;

    let audio;
    if (audioData.numberOfChannels === 2) {
      const SCALING_FACTOR = Math.sqrt(2);

      let left = audioData.getChannelData(0);
      let right = audioData.getChannelData(1);

      audio = new Float32Array(left.length);
      for (let i = 0; i < audioData.length; ++i) {
        audio[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
      }
    } else {
      // If the audio is not stereo, we can just use the first channel:
      audio = audioData.getChannelData(0);
      console.log(audio);
    }

    this.worker.postMessage({
      model: 'Xenova/whisper-tiny',
      multilingual: false,
      quantized: false,
      subtask: 'transcribe',
      language: 'english',
      audio: audio,
    });
  }
}

