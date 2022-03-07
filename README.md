# electron_camera_ffmpeg
An example of using Electron and a native ffmpeg addon to access a webcamera

Visual Example
![demo](https://github.com/khomin/electron_camera_ffmpeg/blob/master/demo.png)

Install
Clone the repo and install dependencies:
```bash
git clone --recursive https://github.com/khomin/electron_camera_ffmpeg.git
cd ./electron_camera_ffmpeg
npm install
```
Then go to native submodule and build the native addon:
```bash
cd ./src/native
node-gyp configure
node-gyp build
```
## License
MIT

## Inspirational Projects
[Electron React Boilerplate](https://github.com/electron-react-boilerplate)

[Node-ffmpeg](https://github.com/luuvish/node-ffmpeg)
