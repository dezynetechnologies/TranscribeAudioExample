import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  isModelLoading: boolean = false;
  isTranscribing: boolean = false;
  loadingProgress: number = 0;
  transcript: string | null = null;
  audioData: Float32Array | null = null;
  //audioContext: AudioContext;
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  audioUrl: string | null = null;
  worker: Worker;
  isBusy: boolean = false;
  result: string | null = null;
  audioD: AudioBuffer|undefined;
  audioFile: File | null = null;

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
    this.worker.postMessage({ type: 'loadModel', model: 'Xenova/whisper-tiny', multilingual: false, quantized: false, subtask: 'transcribe', language: 'english'});
  }

  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };
    this.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(this.audioChunks);
      this.audioUrl = URL.createObjectURL(audioBlob);
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Calculate the length based on the ArrayBuffer size
      const length = arrayBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT;
      this.audioData = new Float32Array(arrayBuffer, 0, length);

      console.log('Audio data loaded from recording:', this.audioData);
    };
    this.mediaRecorder.start();
  }

  stopRecording(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }
  }

  // async loadAndTranscribeAudioFile(filePath: string) {
  //   const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  //   try {
  //     console.log(filePath);
  //     const response = await fetch(filePath);
  //     console.log(response);
  //     if (!response.ok) {
  //       throw new Error(`HTTP error! status: ${response.status}`);
  //     }
  //     const arrayBuffer = await response.arrayBuffer();
  //     const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  //     this.audioD =  audioBuffer;
  //     //this.transcribe(audioBuffer);
  //   } catch (error) {
  //     console.error('Error loading audio file:', error);
  //   }
  // }

  // async transcribe() {
  //   this.isBusy = true;
  //   //this.transcript = undefined;

  //   let audio;
  //   if(this.audioD!==undefined){
  //     if (this.audioD.numberOfChannels === 2) {
  //       const SCALING_FACTOR = Math.sqrt(2);

  //       let left = this.audioD.getChannelData(0);
  //       let right = this.audioD.getChannelData(1);

  //       audio = new Float32Array(left.length);
  //       for (let i = 0; i < this.audioD.length; ++i) {
  //         audio[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
  //       }
  //     } else {
  //       // If the audio is not stereo, we can just use the first channel:
  //       audio = this.audioD.getChannelData(0);
  //     }

  //     this.worker.postMessage({
  //       type: 'transcribe',
  //       model: 'Xenova/whisper-tiny',
  //       multilingual: false,
  //       quantized: false,
  //       subtask: 'transcribe',
  //       language: 'english',
  //       audio,
  //     });
  // }
  // }

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
      await this.processArrayBuffer(arrayBuffer);
    };
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
    };
    reader.readAsArrayBuffer(file);
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
    }

    this.worker.postMessage({
      type: 'transcribe',
      model: 'Xenova/whisper-tiny',
      multilingual: false,
      quantized: false,
      subtask: 'transcribe',
      language: 'english',
      audio: audio,
    });
  }
}
