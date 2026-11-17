# Stadium Soundscape

An interactive web experience that recreates the atmosphere of live sports through immersive stadium soundscapes and 3D visualization of Ullevi Arena and Eleda Stadion.

[Visit the project website](https://stadiumsoundscape.vercel.app)

## Built With

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)
![Mapbox](https://img.shields.io/badge/Mapbox-000000?style=for-the-badge&logo=mapbox&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=react-router&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

## About the project

This interactive web application explores the acoustic environments of Ullevi Arena and Eleda Stadion through 3D visualization and sound.

Developed for Malmö University's course _Situated and speculative sensing: multisensory exploration of environments_, the project explores how listening can shape our understanding of space and place.

## Project concept

StadiumSoundscape lets users listen to and compare sounds from different parts of a football stadium. Users can move between the arenas, choose a listening mode, and hear the full soundscape or focus on an individual stand.

The visualization translates the presence and direction of sound onto the map. This connects listening to place: users can see which parts of the arena are active and explore how different sound sources contribute to the overall soundscape.

## How the map and 3D visualization work

The map is built with Mapbox GL JS through `react-map-gl`. Mapbox provides the map and camera, while Three.js renders the 3D arenas in a custom layer.

The custom layer uses `renderingMode: "3d"` and shares Mapbox’s WebGL context and canvas. This allows Three.js to render the 3D scene as part of the map.

Stadium stands are defined by geographic coordinates in JSON data. These coordinates are converted from longitude and latitude to Mapbox Mercator coordinates, then to local meters around each arena. Three.js uses the map’s camera matrix to keep the arenas and sound visualization aligned with the map as the view changes.

### From stand data to sound visualization

1. Stand locations are marked in the arena.
2. Match and ambient audio play through the experience.
3. The 3D visuals show where the sound comes from.
4. Select a stand to listen to its sound on its own.

## Interaction and listening modes

- Switch between Ullevi and Eleda Stadion.
- Rotate the 3D view to explore the stadium from different angles.
- Play match audio with a timeline tied to the match period.
- Select a stand to listen to its sound separately.
- Explore ambient audio.
- Follow the sound's visual representation in the 3D layer during playback.

## Technology

- **React** builds the interface and manages application state.
- **Mapbox GL JS** displays the map and terrain and controls the map camera.
- **Three.js** renders the sound visualization as a 3D custom layer in Mapbox's WebGL context.
- **Web Audio API** supports audio playback and processing in the sound flows.
- **Vite** provides the development and build tooling.

## License

Distributed under the MIT License. See the [LICENSE](LICENSE) file for details.
