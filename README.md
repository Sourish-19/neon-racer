# Neon Racer: Neural Link Edition

> Use your head. Literally.
> A next-gen synthwave infinite runner controlled by your webcam.

![Menu Screen](/uploaded_image_1769003645323.png)

## Overview

**Neon Racer** is a high-octane 3D infinite runner that runs entirely in your browser. Unlike traditional keyboard games, this uses **Neural Link Technology** (powered by MediaPipe FaceMesh) to track your head position. Simply **lean left or right** to steer your cyber-car through the neon-drenched city.

## 🎮 How to Play

1.  **Initialize Link**: Allow camera access when prompted. The system needs to map your neural facial landmarks.
2.  **Steer with your Head**:
    *   **Lean Left**: Switch to the Left lane.
    *   **Head Center**: Maintain Center lane.
    *   **Lean Right**: Switch to the Right lane.
3.  **Collect & Survive**:
    *   Dodge **Red/Neon Boxes** (Obstacles).
    *   Collect **Coins** for points.
    *   Grab **Power-ups** to gain improvements.
    *   Survive as long as possible to maximize your score.

![Gameplay Action](/uploaded_image_1769004265390.png)

## ⚡ Power-Ups

Keep an eye out for these floating cubes:

| Icon/Color | Name | Effect | Trigger Text |
| :--- | :--- | :--- | :--- |
| **Green Hex** | **SHIELD** | Protects you from one impact. Visualized by a 3D wireframe cage around your car. | `SHIELD ONLINE` |
| **Cyan Cube** | **SLOWMO** | Slows down time by 50% for 5 seconds. Perfect for navigating tight squeezes. | `SLOWMO ONLINE` |
| **Purple Cube** | **MULT** | Doubles your score generation (2X) for 10 seconds. | `MULT ONLINE` |

## 🎧 Immersive Audio System

The game features a dynamic audio engine:
*   **Muffled Atmosphere**: While in the menu, the synthwave track is low-pass filtered, simulating the sound of a club from the street.
*   **Seamless Transition**: As soon as you "Initialize Link" (Start), the filter opens up, bringing the bassline into full focus.
*   **UI Feedback**: High-tech chirps and blips for all interactions.

## 🛠️ Technical Details

Built with pure **Vanilla JavaScript**—no heavy frameworks like React or Three.js were used for the game engine. Everything is custom-written.

*   **Rendering**: HTML5 Canvas (`CanvasRenderingContext2D`) with custom 3D projection math.
*   **Input**: Google MediaPipe FaceMesh for real-time landmark detection.
*   **Audio**: Web Audio API (`AudioContext`, `BiquadFilterNode`, `OscillatorNode`) for real-time sound synthesis.

## 🚀 Running Locally

Use any static file server.

**Python**
```bash
python -m http.server 8000
```

**Node.js**
```bash
npx http-server .
```

Then visit `http://localhost:8000`.

---
*Created in the Antigravity Playground.*
