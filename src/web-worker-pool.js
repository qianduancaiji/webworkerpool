let _noop = function () { };

/**
 * 队列
 */
class Queue extends Set {
  constructor(iterable) {
    super(iterable);
  }

  /**
 * 添加一个元素到队列尾部
 */
  push(el) {
    this.add(el);
  }

  /**
 * 移除并返回队列头部的元素
 */
  put() {
    let el;

    for (el of this) {
      break;
    }
    this.delete(el);

    return el;
  }
}

/**
 * worker 代理
 */
class WorkerAgent {
  constructor(worker, registerInfo) {
    this._worker = worker;
    this._eventDeregistrations = [];
    this._isDestroy = false;
    this._registerInfo = registerInfo;
  }

  get onmessage() {
    return this._worker && this._worker.onmessage;
  }

  set onmessage(fun) {
    this._isDestroy === false && (this._worker.onmessage = fun);
  }

  get onerror() {
    return this._worker && this._worker.onerror;
  }

  set onerror(fun) {
    this._isDestroy === false && (this._worker.onerror = fun);
  }

  addEventListener(type, listener, useCapture, wantsUntrusted) {
    this._eventDeregistrations.push(() => {
      this._worker.removeEventListener(type, listener, useCapture);
    });

    this._worker.addEventListener(type, listener, useCapture, wantsUntrusted);
  }

  removeEventListener(type, listener, useCapture) {
    this._worker.removeEventListener(type, listener, useCapture);
  }

  cleanEventListener() {
    this._eventDeregistrations.forEach((deregistration) => deregistration());
  }

  postMessage(...args) {
    this._worker.postMessage({
      run: this._registerInfo.thread.toString(),
      args: args
    })
  }

  /**
 * 解除代理跟 worker 的绑定
 */
  static destroy(agent) {
    let worker = agent._worker;

    // clean worker
    worker.onmessage = undefined;
    worker.onerror = undefined;
    agent.cleanEventListener();

    // clean agent
    agent._worker = undefined;
    agent._eventDeregistrations = undefined;
    agent.addEventListener = agent.removeEventListener = agent.cleanEventListener = _noop;

    return worker;
  }
}

/**
 * 线程池
 */
class WorkerPool {
  constructor(config) {
    config = config || {};

    // 等待中的 worker 所在的线程池
    this.idlePool = new Queue();

    // 正在执行任务的 worker 所在线程池
    this.busyPool = new Queue();

    // 正在等待执行的任务队列
    this.queue = new Queue();

    // 在线程池所维护的 worker 的最大数量
    this.max = config.max || 4;

    // 当前线程池的长度
    this.length = 0;
  }

  /**
   * 登记以预约使用 worker；登记之后，当有一个空闲的 worker 可供使用时，会让该 worker 受理此次预约。
   *
   * @param {function} handler -
   *     当有一个空闲的 worker 可以用于执行此任务时，会调用该函数；
   *     在函数内，可以向 worker 发布消息，并监听 worker 所抛出的消息和异常；
   *     当使用完成后，需要调用 done() 函数通知线程池该任务执行完毕。
   *
   * @return {function} deregistration
   *
   *     若该登记还未被受理，调用该函数可以取消登记。
   *     若该登记已受理或受理完毕，调用该函数不会起任何作用。
   */
    register(handler) {
      let registerInfo = {
        handler: handler.start,
        thread: handler.thread
      };

      this.queue.push(registerInfo);
      this._execute();

      return (() => this._deregistration(registerInfo));
    }

    /**
   * 注销登记
   *
   * @param {number} registerInfo - 登记信息
   */
    _deregistration (registerInfo) {
    this.queue.delete(registerInfo);
  }

  /**
  * 使用一个空闲中的 worker 受理登记队列中的一个登记，若当前没有空闲的 worker，或登记队列为空，则不做任何操作。
  */
  _execute() {

    if (!this.queue.size) {
      return ;
    }

    let worker = this._getWorker();

    if (!worker) {
      return;
    }

    let registerInfo = this.queue.put();

    let agent = new WorkerAgent(worker, registerInfo);

    agent.release = () => {
      WorkerAgent.destroy(agent);
      this._releaseWorker(worker);
    };

    registerInfo.handler.call(agent, agent);
  }

  /**
  * 返回一个空闲中的 worker，同时将其从空闲池移到工作池中。
  */
  _getWorker() {
    if (!this.idlePool.size) {
      this._createWorker();
    }

    let worker = this.idlePool.put();

    if (worker) {
      this.idlePool.delete(worker);
      this.busyPool.push(worker);
    }

    return worker;
  }

  /**
  * 释放一个 worker，该操作会将 worker 从工作池移回到空闲池中，等待下次调用。
  */
  _releaseWorker(worker) {
    this.busyPool.delete(worker);
    this.idlePool.push(worker);

    this._execute();
  }

  /**
  * 创建一个 worker
  */
  _createWorker() {
    if (this.length >= this.max) {
      return null;
    } else {
      let worker = this.newWork();

      this.idlePool.push(worker);
      this.length++;

      return worker;
    }
  }
  newWork() {
    const blob = new Blob([
      `
        self.onmessage = function(e) {
          function t(str) {
            var startIndex = str.indexOf('{');
            return str.slice(startIndex + 1, str.length - 1);
          }
          var body = t(e.data.run);
          var f = new Function('data', body);
          f(e.data.args).then(r => {
            self.postMessage(r);
          })
        }
      `
    ], {
      type: 'javascript/worker'
    })

    return new Worker(URL.createObjectURL(blob));
  }
  destroy() {
    this.busyPool.forEach(worker => {
      worker.terminate();
    })
    this.idlePool.forEach(worker => {
      worker.terminate();
    })
    this.busyPool = null;
    this.length = 0;
    this.idlePool = null;
    this.queue = null;
  }
}

export default WorkerPool;