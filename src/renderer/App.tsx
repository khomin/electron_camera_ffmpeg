import React, { useState } from 'react';
import { Button, Col, Row } from 'react-bootstrap';
import './App.css';

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

  componentDidMount() {
      window.electron.ipcRenderer.on('ipc-example_stats', (data) => {
        this.setState({ videoActive: data.is_active == true } )
        this.setState({ buttonText: data.is_active == true ? 'stop video' : 'start video'} )
        this.setState({ packets: data.packet_cnt } )
        this.setState({ errors: data.err_cnt } )
        // var log = `test: ui stats, is_active=${ data.is_active }, packet_cnt=${ data.packet_cnt }, err_cnt=${ data.err_cnt }`;
        // console.log(log);
      });
      window.electron.ipcRenderer.on('ipc-example_frame', (data) => {
        this.setState({ resolution: data.width + 'x' + data.height} )
        this.setState({ frame: data.data} )
        this.setState({ frameBytes: data.data.byteLength } )
        this.setState({ frameWidth: data.width } )
        this.setState({ frameHeight: data.height } )
        this.updateFrame()
        //var log = `test: ui frame, width=${data.width}, height=${data.height}, data=${data.data.byteLength}`;
        //console.log(log);
      });
  }

  componentWillUnmount() {
    window.electron.ipcRenderer.removeListener('ipc-example_stats')
    window.electron.ipcRenderer.removeListener('ipc-example_frame')
  }

  updateFrame() {
    var canvas = document.getElementById("frameCanvas");
    var ctx = canvas.getContext("2d");

    // const ctx = canvasRef.getContext('2d')
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

          {/* 
            button 1920x1080
          */}
          { this.state.videoActive && 
            <Button className="button"
              onClick={()=> {
                  window.electron.ipcRenderer.setDimention(1920, 1080)
              }
            }>use 1920x1080</Button>
          }
          {/*
             button 1280x1024
          */}
          { this.state.videoActive && 
            <Button className="button"
              onClick={()=> {
                  window.electron.ipcRenderer.setDimention(1280, 1024)
              }
            }>use 1280x1024</Button>
          }
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