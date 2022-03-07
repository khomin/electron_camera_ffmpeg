# electron_camera_ffmpeg
An example of using Electron and a native ffmpeg addon to access a webcamera

This guide may be helpful to someone who is trying to find a way<br/>to work with Electron if they need to use a c++ library or code<br/>
I was looking for a more realistic example than a simple 'hello world' and i didn't succeed<br/>
So let me share my experience<br/>

![demo](https://github.com/khomin/electron_camera_ffmpeg/blob/master/demo.png)

We have three layers:<br/>
 - main (launches BrowserWindow, listens for signals and is considered a backend)<br/>
 - rendering (runs React JS, handles UI events, shows video frame and info)<br/>
 - native (responsible for ffmpeg, starts/stops the video, sends a callback to the main layer)<br/>

Render thread cannot directly access the main thread and vice versa<br/>
All communications must be done through the ipcMain/ipcRenderer modules<br/>
(it provides methods to allow synchronous and asynchronous messages to be sent from these layers)<br/>

Set the listener in main.ts<br/>
It will receive events from Render thread and pass them to native layer<br/>
```
ipcMain.on('ipc-example', async (event, arg) => {
  if(arg.type == 'startCamera') {
    addon.setCameraEnabled()
  } else if(arg.type == 'stopCamera') {
    addon.setCameraDisable()
  } else if(arg.type == 'setDimention') {
      addon.setDimention(arg.width, arg.height)
  }
});
```
Listen to responses from Native and translate them to Render thread<br/>
We set the listener callback just a couple of lines below<br/>
So we have a completed chain:<br/>
    Render -> Main -> Native<br/>
    Native -> Main -> Render<br/>

```
  addon.setCb(function(data) {
    if(data.type == 'stats') {
      mainWindow.webContents.send('ipc-example_stats', data)
    } else if(data.type == 'frame') {
      mainWindow.webContents.send('ipc-example_frame', data)
    }
});
```
Now it's time to see what's on the render thread<br/>
We will send events 'startCamera', 'stopCamera' and 'setDimention<br/>
A simple React.Component class and props for handling UI logic<br/>
I hope everything is clear from the names<br/>
```
export default class Root extends React.Component {
  constructor(props) {
      super(props);
      this.state = { 
        videoActive: false,
        buttonText: 'Start video',
        packets: 0,
        errors: 0,
        resolution: 0,
        frame: null,
        frameBytes: 0,
        frameWidth: 1000,
        frameHeight: 1000
      };
  }
```
To send messages from Render to Main use this construct<br/>
    ```
    window.electron.ipcRenderer.startCamera()
    ```<br/>
And to set a listener on certain channel<br/>
    ```
    ipcRenderer.on('ipc-name', (cb) => {}
    ```
    
So, the full code is:
```
  componentDidMount() {
      window.electron.ipcRenderer.on('ipc-example_stats', (data) => {
        this.setState({ videoActive: data.is_active == true } )
        this.setState({ buttonText: data.is_active == true ? 'stop video' : 'start video'} )
        this.setState({ packets: data.packet_cnt } )
        this.setState({ errors: data.err_cnt } )
      });
      window.electron.ipcRenderer.on('ipc-example_frame', (data) => {
        this.setState({ resolution: data.width + 'x' + data.height} )
        this.setState({ frame: data.data} )
        this.setState({ frameBytes: data.data.byteLength } )
        this.setState({ frameWidth: data.width } )
        this.setState({ frameHeight: data.height } )
        this.updateFrame()
      });
  }
```
And when the class is no longer needed, we have to remove these listeners:<br/>
```
  componentWillUnmount() {
    window.electron.ipcRenderer.removeListener('ipc-example_stats')
    window.electron.ipcRenderer.removeListener('ipc-example_frame')
  }
```
We may have noticed the this.updateFrame() method<br/>
This is where the canvas is loaded with a video frame:<br/>
```
  updateFrame() {
    var canvas = document.getElementById("frameCanvas");
    var ctx = canvas.getContext("2d");
    var data = this.state.frame
    var len = this.state.frameBytes
    var frameHeight = this.state.frameHeight
    var frameWidth = this.state.frameWidth
    if(data == null || len == 0 || frameHeight == 0 || frameWidth == 0) return

    var imageData = ctx.createImageData(frameWidth, frameHeight);
    const data_img = imageData.data;
    var pixels = new Uint8Array(data)
    var i = 0; // cursor for RGBA buffer
    var t = 0; // cursor for RGB buffer
    var _len = data_img.length
    for(; i < _len; i += 4) {
      data_img[i]   = pixels[t+2]
      data_img[i+1] = pixels[t+1]
      data_img[i+2] = pixels[t]
      data_img[i+3] = 255
      t += 4;
    }
    ctx.putImageData(imageData, 0, 0);
  }
```
The UI will look like this:<br/>
```
  render() {
      return (
      <div>
        <Row className="topPanel">
          <div className="status"/>
          
          {/*
             button enable/disable video 
          */}
          <Button className="button"
            onClick={()=> {
              if(this.state.videoActive) {
                window.electron.ipcRenderer.stopCamera()
              } else {
                window.electron.ipcRenderer.startCamera()
              }
            }
          }>{this.state.buttonText}</Button>
        </Row>

        {/*
             statistics 
        */}
        <Col className="stats">
            <label className="text_caption">Packets: {this.state.packets},</label>
            <label className="text_caption">Errors: {this.state.errors},</label>
            <label className="text_caption">Resolution: {this.state.resolution}</label>
        </Col>
        <canvas
          id="frameCanvas"
          width={this.state.frameWidth}
          height={this.state.frameHeight}
      />
      </div>
      );
  }
}
```
Now let's look at the native layer<br/>
Most of the work is in it<br/>
First time I thought it would be really hard<br/>
Especially concerning linking and compiling libraries<br/>
But it turned out to be quite simple, since the 'node-gyb build'<br/>
does its job perfectly and there is not much difference compared to the bare cmake

The entry point is "Init"<br/>
In this place we create m_video and set the listeners<br/>
We cannot send data to JS right away<br/>
V8 imposes restrictions on access to threads<br/>
Thus it is impossible to pass data from other thread to main without synchronization<br/>
Thread-safe methods called Napi::ThreadSafeFunction are used for this task<br/>

The strategy is to store the data from the callback into a queue<br/>
And process this queue from Napi::ThreadSafeFunction:<br/>
```
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    m_video = new Video();
    m_video->setStatusCallBack(([&](VideStats stats) {
        if(threadCtx == NULL) return;
        std::lock_guard<std::mutex>lk(threadCtx->m_data_lock);
        auto data = new DataItemStats();
        data->type = DataItemType::DataStats;
        data->stats = new VideStats();
        data->stats->is_active = stats.is_active;
        data->stats->packet_cnt = stats.packet_cnt;
        data->stats->err_cnt = stats.err_cnt;
        threadCtx->m_data_queue.push(data);
        threadCtx->m_data_cv.notify_one();
    }));
    m_video->setFrameCallBack(([&](AVFrame* frame, uint32_t bufSize) {
        if(frame != NULL) {
            std::lock_guard<std::mutex>lk(threadCtx->m_data_lock);
            auto data = new DataItemFrame();
            data->type = DataItemType::DataFrame;
            data->frame = new uint8_t[bufSize];
            data->frame_buf_size = bufSize;
            data->width = frame->width;
            data->height = frame->height;
            memcpy(data->frame, (uint8_t*)frame->data[0], bufSize);
            threadCtx->m_data_queue.push(data);
            threadCtx->m_data_cv.notify_one();
        } else {
            std::cout << "frameCallback: frame == null" << std::endl;
        }
    }));

    exports["setCb"] = Napi::Function::New(env, setCallback, std::string("setCallback"));
    exports.Set(Napi::String::New(env, "setCameraEnabled"), Napi::Function::New(env, StartVideo));
    exports.Set(Napi::String::New(env, "setCameraDisable"), Napi::Function::New(env, StopVideo));
    exports.Set(Napi::String::New(env, "setDimention"), Napi::Function::New(env, SetDimention));
```
Inside the queue, use these classes:<br/>
```
class DataItem {
public:
    DataItemType type;
};
```
And since we have different data types (frames, info)<br/>
The best way is to extend derived classes<br/>
```
class DataItemStats : public DataItem {
public:
    VideStats* stats;
};
class DataItemFrame : public DataItem {
public:
    uint8_t* frame;
    uint32_t frame_buf_size;
    int width;
    int height;
};
```
All data is collected inside one class for convenience:<br/>
```
struct ThreadCtx {
    ThreadCtx(Napi::Env env) {};
    std::thread nativeThread;
    Napi::ThreadSafeFunction tsfn;
    bool toCancel = false;
    std::queue<DataItem*> m_data_queue;
    std::mutex m_data_lock;
    std::condition_variable m_data_cv;
};
```
And the methods that were described above in - exports["setCb"]<br/>
Must have an implementation:<br/>
```
Napi::Value setCallback(const Napi::CallbackInfo& info) {
    auto env = info.Env();
    threadCtx = new ThreadCtx(env);
    // a safe function
    threadCtx->tsfn = Napi::ThreadSafeFunction::New(
                            env, 
                            info[0].As<Napi::Function>(),
                            "CallbackMethod", 
                            0, 1 , 
                            threadCtx,
        [&]( Napi::Env, void *finalizeData, ThreadCtx *context ) {
            threadCtx->nativeThread.join();
        },
        (void*)nullptr
    );

    // a thread for the queue
    // it calls threadCtx->tsfn.BlockingCall
    // and sends a json to js layer
    threadCtx->nativeThread = std::thread([&]{
        auto callbackStats = [](Napi::Env env, Napi::Function cb, char* buffer) {
            auto data = (DataItemStats*)buffer;
            if(data == NULL) return;

            Napi::Object obj = Napi::Object::New(env);
            obj.Set("type", std::string("stats"));
            obj.Set("is_active", std::to_string(data->stats->is_active));
            obj.Set("packet_cnt", std::to_string(data->stats->packet_cnt));
            obj.Set("err_cnt", std::to_string(data->stats->err_cnt));
            cb.Call({obj});
            delete data->stats;
            delete data;
        };
        auto callbackFrame = [](Napi::Env env, Napi::Function cb, char* buffer) {
            auto data = (DataItemFrame*)buffer;
            if(data == NULL) return;

            napi_value arrayBuffer;
            void* yourPointer = malloc(data->frame_buf_size);
            napi_create_arraybuffer(env, data->frame_buf_size, &yourPointer, &arrayBuffer);
            memcpy((uint8_t*)yourPointer, data->frame, data->frame_buf_size);

            Napi::Object obj = Napi::Object::New(env);
            obj.Set("type", std::string("frame"));
            obj.Set("data", arrayBuffer);
            obj.Set("width", data->width);
            obj.Set("height", data->height);
            cb.Call({obj});
            delete data->frame;
            delete data;
        };
        while(!threadCtx->toCancel) {
            DataItem* data_item = NULL;
            std::unique_lock<std::mutex> lk(threadCtx->m_data_lock);
            threadCtx->m_data_cv.wait(lk, [&] {
                return !threadCtx->m_data_queue.empty();
            });

            while(!threadCtx->m_data_queue.empty()) {
                data_item = threadCtx->m_data_queue.front();
                threadCtx->m_data_queue.pop();
                if(data_item == NULL) continue;

                if(data_item->type == DataItemType::DataStats) {
                    napi_status status = threadCtx->tsfn.BlockingCall((char*)data_item, callbackStats);
                    if (status != napi_ok) {
                        // Handle error
                        break;
                    }
                } else if(data_item->type == DataItemType::DataFrame) {
                    napi_status status = threadCtx->tsfn.BlockingCall((char*)data_item, callbackFrame);
                    if (status != napi_ok) {
                        // Handle error
                        break;
                    }
                }
            }
        }
        threadCtx->tsfn.Release();
    });
    return Napi::String::New(info.Env(), std::string("SimpleAsyncWorker for seconds queued.").c_str());
};
```
And a couple of methods that don't need a queue:<br/>
```
Napi::Boolean StartVideo(const Napi::CallbackInfo& info) {
    std::cout << "Command: startCamera\n";
    if(!m_video->isStarted()) {
        m_video->startVideoCamera();
    }
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, true);
}
Napi::Boolean StopVideo(const Napi::CallbackInfo& info) {
    std::cout << "Command: stopCamera\n";
    if(m_video->isStarted()) {
        m_video->stopVideo();
    }
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, true);
}
Napi::Value SetDimention(const Napi::CallbackInfo& info) {
    if(m_video == NULL || !m_video->isStarted()) {
        std::cout << "Command: setDimention -camera is not started!\n";
    } else if(info.Length() == 2) {
        int width = info[0].As<Napi::Value>().ToNumber();
        int height = info[1].As<Napi::Value>().ToNumber();;
        std::cout << "Command: setDimention: " << ",width=" << width << ",height=" << height << std::endl;
        m_video->setResolution(width, height);
    } else {
        std::cout << "Command: setDimention missed arguments\n";
    }
    return Napi::Number::New(info.Env(), true);
}
```
At the end should be this define<br/>
NODE_API_MODULE(<addon name>, <init>):<br/>
```
NODE_API_MODULE(addon, Init)
```
If you have any question you can contact me over email<br/>
khominvladimir@yandex.ru<br/>

The c++ addon itself is included as a submodule and will be cloned automatically<br/>
(https://github.com/khomin/electron_ffmpeg_addon_camera)<br/>
But it has to be built independently<br/>

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
