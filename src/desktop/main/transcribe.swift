// transcribe.swift — Real-time streaming speech-to-text using Apple Speech framework
// Reads raw PCM float32 mono audio from stdin, outputs JSON lines to stdout:
//   {"partial":"hello wor"}
//   {"final":"hello world"}
//
// First line of stdin must be: RATE:<sampleRate>\n (e.g. "RATE:16000\n")
// Then raw float32 PCM bytes follow continuously.
// Close stdin to signal end of audio.
//
// Compile: swiftc -O transcribe.swift -o transcribe -framework Speech -framework AVFoundation

import Foundation
import Speech
import AVFoundation

// Flush stdout immediately
setbuf(stdout, nil)
setbuf(stderr, nil)

func emit(_ dict: [String: String]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

// Read sample rate from first line
guard let headerLine = readLine(), headerLine.hasPrefix("RATE:"),
      let sampleRate = Double(headerLine.dropFirst(5)) else {
    emit(["error": "First line must be RATE:<sampleRate>"])
    exit(1)
}

let semaphore = DispatchSemaphore(value: 0)

SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized else {
        emit(["error": "Speech recognition not authorized. Enable in System Settings > Privacy & Security > Speech Recognition."])
        semaphore.signal()
        exit(1)
        return
    }
    semaphore.signal()
}
semaphore.wait()

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
      recognizer.isAvailable else {
    emit(["error": "Speech recognizer not available"])
    exit(1)
}

let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true
if #available(macOS 13, *) {
    request.requiresOnDeviceRecognition = true
}

// Audio format: float32, mono, at the provided sample rate
guard let audioFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                       sampleRate: sampleRate,
                                       channels: 1,
                                       interleaved: false) else {
    emit(["error": "Could not create audio format"])
    exit(1)
}

var lastPartial = ""
let doneSem = DispatchSemaphore(value: 0)

let task = recognizer.recognitionTask(with: request) { result, error in
    if let result = result {
        let text = result.bestTranscription.formattedString
        if result.isFinal {
            emit(["final": text])
            doneSem.signal()
        } else if text != lastPartial {
            lastPartial = text
            emit(["partial": text])
        }
    }
    if let error = error {
        // Error code 1 = "no speech detected" on end, that's normal
        let nsError = error as NSError
        if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 1 {
            // Normal end — emit final with last known text
            if !lastPartial.isEmpty {
                emit(["final": lastPartial])
            }
        } else if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 4 {
            // Retry without on-device if it failed
            // (handled below)
        } else {
            emit(["error": error.localizedDescription])
        }
        doneSem.signal()
    }
}

// Read PCM data from stdin and feed to recognizer
let bufferSize = 4096 // frames per buffer
let bytesPerFrame = MemoryLayout<Float>.size // 4 bytes
let readSize = bufferSize * bytesPerFrame
let stdinHandle = FileHandle.standardInput

DispatchQueue.global(qos: .userInitiated).async {
    while true {
        let data = stdinHandle.readData(ofLength: readSize)
        if data.isEmpty {
            // stdin closed — end audio stream
            request.endAudio()
            break
        }

        let frameCount = data.count / bytesPerFrame
        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: audioFormat,
                                                frameCapacity: AVAudioFrameCount(frameCount)) else {
            continue
        }
        pcmBuffer.frameLength = AVAudioFrameCount(frameCount)

        // Copy float32 samples into the buffer
        data.withUnsafeBytes { rawBuf in
            if let src = rawBuf.baseAddress?.assumingMemoryBound(to: Float.self),
               let dst = pcmBuffer.floatChannelData?[0] {
                dst.update(from: src, count: frameCount)
            }
        }

        request.append(pcmBuffer)
    }
}

// Wait for recognition to finish
let timeout = doneSem.wait(timeout: .now() + 10)
if timeout == .timedOut {
    task.cancel()
    if !lastPartial.isEmpty {
        emit(["final": lastPartial])
    }
}
