<template>
  <div id="app">
    <canvas id="canvas" width="1000" height="500"></canvas>
    <span class="count">绘制像素：{{ count }}</span>
  </div>
</template>

<script>

import workerpool from './web-worker-pool';
const pool = new workerpool();

console.log(pool, 'pool')
export default {
  name: 'App',
  data() {
    return {
      count: 0
    }
  },
  components: {

  },
  mounted() {
    const canvas = document.querySelector('#canvas');
    const cxt = canvas.getContext('2d');
    console.log(cxt)
    cxt.lineWidth = 100;
    cxt.strokeStyle = 'red';
    let isDown = false;
    canvas.addEventListener('mousedown', e => {
      isDown = true;
      cxt.beginPath();
      cxt.moveTo(e.offsetX, e.offsetY);
    })
    canvas.addEventListener('mousemove', e => {
      if (isDown) {
        cxt.lineTo(e.offsetX, e.offsetY);
        cxt.stroke();
      }
    })
    canvas.addEventListener('mouseup', e => {
      if (isDown) {
        cxt.lineTo(e.offsetX, e.offsetY);
        cxt.stroke();
        isDown = false;
      }
    })

    setInterval(() => {
      pool.register({
        start: (workerAgent) => {
          workerAgent.onmessage = (e) => {
            this.count = e.data;
            workerAgent.release();
          }

          workerAgent.onerror = function(e) {
            console.log(e)
          }

          workerAgent.postMessage(cxt.getImageData(0, 0, canvas.width, canvas.height).data);
        },
        thread: function(data) {
          return new Promise((resolve) => {
            let length = data[0].length;
            let count = 0;
            for (let index = 0; index < length; index += 4) {
              if (data[0][index] !== 0 || data[0][index + 1] !== 0 || data[0][index + 2] !== 0 || data[0][index + 3] !== 0) {
                count++
              }
            }
            resolve(count);
          })
        }
      })
    }, 500);
    
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
canvas {
  background: #ccc;
}
.count {
  position: absolute;
  top: 0;
  left: 10px;
}
</style>
