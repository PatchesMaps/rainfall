import TileQueue from 'ol/TileQueue'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import ImageWMS from 'ol/source/ImageWMS'
import Vector from 'ol/source/Vector'
import stringify from 'json-stringify-safe'
import { Projection } from 'ol/proj'
import { inView } from 'ol/layer/Layer'
import { getTilePriority as tilePriorityFunction } from 'ol/TileQueue'

import {
  containsExtent,
  getCenter,
  getForViewAndSize,
  getHeight,
  getWidth,
} from 'ol/extent.js'
import { assign } from 'ol/obj.js'
import { listenImage } from 'ol/Image.js'
import EventType from 'ol/events/EventType.js'
import ImageState from 'ol/ImageState.js'
import ImageBase from 'ol/ImageBase.js'

console.log('WORKER')

/** @type {any} */
const worker = self // eslint-disable-line

const DEFAULT_WMS_VERSION = '1.3.0'

class CustomImageWrapper extends ImageBase {
  /**
   * @param {import("./extent.js").Extent} extent Extent.
   * @param {number|undefined} resolution Resolution.
   * @param {number} pixelRatio Pixel ratio.
   * @param {string} src Image source URI.
   * @param {?string} crossOrigin Cross origin.
   * @param {LoadFunction} imageLoadFunction Image load function.
   */
  constructor(
    extent,
    resolution,
    pixelRatio,
    src,
    crossOrigin,
    imageLoadFunction
  ) {
    super(extent, resolution, pixelRatio, ImageState.IDLE);

    /**
     * @private
     * @type {string}
     */
    this.src_ = src;

    /**
     * @private
     * @type {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement}
     */
    this.image_ = new OffscreenCanvas(1, 1)
    if (crossOrigin !== null) {
      this.image_.crossOrigin = crossOrigin;
    }

    /**
     * @private
     * @type {?function():void}
     */
    this.unlisten_ = null;

    /**
     * @protected
     * @type {import("./ImageState.js").default}
     */
    this.state = ImageState.IDLE;

    /**
     * @private
     * @type {LoadFunction}
     */
    this.imageLoadFunction_ = imageLoadFunction;
  }

  /**
   * @return {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} Image.
   * @api
   */
  getImage() {
    return this.image_;
  }

  /**
   * Tracks loading or read errors.
   *
   * @private
   */
  handleImageError_() {
    this.state = ImageState.ERROR;
    this.unlistenImage_();
    this.changed();
  }

  /**
   * Tracks successful image load.
   *
   * @private
   */
  handleImageLoad_() {
    if (this.resolution === undefined) {
      this.resolution = getHeight(this.extent) / this.image_.height;
    }
    this.state = ImageState.LOADED;
    this.unlistenImage_();
    this.changed();
  }

  /**
   * Load the image or retry if loading previously failed.
   * Loading is taken care of by the tile queue, and calling this method is
   * only needed for preloading or for reloading in case of an error.
   * @api
   */
  load() {
    if (this.state == ImageState.IDLE || this.state == ImageState.ERROR) {
      this.state = ImageState.LOADING;
      this.changed();
      this.imageLoadFunction_(this, this.src_);
      this.unlisten_ = listenImage(
        this.image_,
        this.handleImageLoad_.bind(this),
        this.handleImageError_.bind(this)
      );
    }
  }

  /**
   * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} image Image.
   */
  setImage(image) {
    this.image_ = image;
    this.resolution = getHeight(this.extent) / this.image_.height;
  }

  /**
   * Discards event handlers which listen for load completion or errors.
   *
   * @private
   */
  unlistenImage_() {
    if (this.unlisten_) {
      this.unlisten_();
      this.unlisten_ = null;
    }
  }
}
class CustomImageWMS extends ImageWMS {
  getImageInternal(extent, resolution, pixelRatio, projection) {
    console.log('INSIDE')
    if (this.url_ === undefined) {
      return null;
    }

    resolution = this.findNearestResolution(resolution);

    if (pixelRatio != 1 && (!this.hidpi_ || this.serverType_ === undefined)) {
      pixelRatio = 1;
    }

    const imageResolution = resolution / pixelRatio;

    const center = getCenter(extent);
    const viewWidth = Math.ceil(getWidth(extent) / imageResolution);
    const viewHeight = Math.ceil(getHeight(extent) / imageResolution);
    const viewExtent = getForViewAndSize(center, imageResolution, 0, [
      viewWidth,
      viewHeight,
    ]);
    const requestWidth = Math.ceil(
      (this.ratio_ * getWidth(extent)) / imageResolution
    );
    const requestHeight = Math.ceil(
      (this.ratio_ * getHeight(extent)) / imageResolution
    );
    const requestExtent = getForViewAndSize(center, imageResolution, 0, [
      requestWidth,
      requestHeight,
    ]);

    const image = this.image_;
    if (
      image &&
      this.renderedRevision_ == this.getRevision() &&
      image.getResolution() == resolution &&
      image.getPixelRatio() == pixelRatio &&
      containsExtent(image.getExtent(), viewExtent)
    ) {
      return image;
    }

    const params = {
      'SERVICE': 'WMS',
      'VERSION': DEFAULT_WMS_VERSION,
      'REQUEST': 'GetMap',
      'FORMAT': 'image/png',
      'TRANSPARENT': true,
    };
    assign(params, this.params_);

    this.imageSize_[0] = Math.round(getWidth(requestExtent) / imageResolution);
    this.imageSize_[1] = Math.round(getHeight(requestExtent) / imageResolution);

    const url = this.getRequestUrl_(
      requestExtent,
      this.imageSize_,
      pixelRatio,
      projection,
      params
    );

    this.image_ = new CustomImageWrapper(
      requestExtent,
      resolution,
      pixelRatio,
      url,
      this.crossOrigin_,
      this.imageLoadFunction_
    );

    this.renderedRevision_ = this.getRevision();

    this.image_.addEventListener(
      EventType.CHANGE,
      this.handleImageChange.bind(this)
    );

    return this.image_;
  }
}

let frameState, pixelRatio, rendererTransform, rainCanvas, dpr
// let dpr = 1
const canvas = new OffscreenCanvas(1, 1)
console.log('canvas:', canvas)
const tmpContext = canvas.getContext('2d')
// OffscreenCanvas does not have a style, so we mock it
canvas.style = {}

const sources = {
  aspect: new CustomImageWMS({
    url: 'https://elevation.nationalmap.gov:443/arcgis/services/3DEPElevation/ImageServer/WMSServer',
    params: {
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      LAYERS: '3DEPElevation:Aspect Degrees',
    },
    crossOrigin: 'anonymous',
    imageLoadFunction: (image, src) => {
      console.log('image, src:', image, src)
      image.getImage().src = src;
    }
  }),
  slope: new CustomImageWMS({
    url: 'https://elevation.nationalmap.gov:443/arcgis/services/3DEPElevation/ImageServer/WMSServer',
    params: {
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      LAYERS: '3DEPElevation:Slope Degrees'
    },
    crossOrigin: 'anonymous'
  }),
  // weather: new ImageWMS({
  //   attributions: ['Iowa State University'],
  //   url: 'https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/radar_base_reflectivity/MapServer',
  //   params: { 'LAYERS': 'radar_base_reflectivity' },
  // }),
}
const layers = [
  new ImageLayer({ source: sources.aspect }),
  new ImageLayer({ source: sources.slope }),
  // new ImageLayer({ source: sources.weather }),
]

const raindrops = []
const tileQueue = new TileQueue(
  (tile, tileSourceKey, tileCenter, tileResolution) =>
    tilePriorityFunction(
      frameState,
      tile,
      tileSourceKey,
      tileCenter,
      tileResolution
    ),
  () => worker.postMessage({ action: 'requestRender' })
)
const maxTotalLoading = 8
const maxNewLoads = 2

function getColorIndicesForCoord(x, y, width) {
  const red = y * (width * 4) + x * 4 // this is the equation for finding the start of the color data for a given pixel in an image
  return [red, red + 1, red + 2, red + 3] // returns the indeces of the rgba values
}

function Raindrop(cx, cy, direction) {
  const color = 'rgba(0, 50, 200, 255)'
  const size = 1
  const radius = 1
  let x = cx // eslint-disable-line newline-after-var
  let y = cy
  function draw(ctx) {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2, true)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    // ctx.fillRect(x, y, size, size) // we use fillRect because it is more performant than arc
  }
  // calculate the particle's physics
  function update() {
    const ctx = rainCanvas.getContext('2d')

    draw(ctx)
  }

  function getDirection () {}
  function getSlope () {}

  return {
    draw,
    update
  }
}

// constructs an array of particles from the passed ImageData object
function atomize(canvas) {
  const { height, width } = canvas
  const step = 10 * dpr // effectively the divisor to downsample our image by. low step value = higher image quality = lower performance and vice versa
  let n = 0
  for (let y = 0, y2 = height; y <= y2; y += step) { // Scan the image by every nth column for every nth row.
    for (let x = 0, x2 = width; x <= x2; x += step) {
      const indices = getColorIndicesForCoord(x, y, width) // get the indeces of the rgba values in our ImageData object for the given coordinate
      raindrops.splice(n, 1, Raindrop(x, y, indices))
      n++
    }
  }
}

function animate() {
  return function () {
    rainCanvas.getContext('2d').clearRect(0, 0, rainCanvas.width, rainCanvas.height) // clear the canvas
    raindrops.forEach(particle => particle.update()) // calculate the new position for and draw each particle
    requestAnimationFrame(animate()) // recursively calls animate for each frame
  }
}

worker.addEventListener('message', event => {
  console.log('event:', event)
  if (event.data.action !== 'render') return
  if (event.data.canvas) {
    rainCanvas = event.data.canvas
    layers.forEach((layer) => {
      layer.getRenderer().useContainer = function (target, transform) {
        console.log('useContainer')
        this.containerReused = this.getLayer() !== layers[0]
        this.canvas = rainCanvas
        this.context = rainCanvas.getContext('2d')
        this.container = {
          firstElementChild: rainCanvas,
        }
        rendererTransform = transform
      }
    })
    dpr = event.data.dpr
    atomize(rainCanvas)
    requestAnimationFrame(animate())
  }
  // if (canvas) atomize(canvas)
  frameState = event.data.frameState
  if (!pixelRatio) {
    pixelRatio = frameState.pixelRatio
  }
  frameState.tileQueue = tileQueue
  frameState.viewState.projection.__proto__ = Projection.prototype

  layers.forEach((layer) => {
    if (inView(layer.getLayerState(), frameState.viewState)) {
      const renderer = layer.getRenderer()
      renderer.prepareFrame(frameState)
      renderer.renderFrame(frameState, canvas)
    }
  })
  // layers.forEach((layer) => layer.renderDeclutter(frameState))
  // if (tileQueue.getTilesLoading() < maxTotalLoading) {
  //   tileQueue.reprioritize()
  //   tileQueue.loadMoreTiles(maxTotalLoading, maxNewLoads)
  // }
  // const imageData = canvas.transferToImageBitmap()
  // console.log('imageData:', imageData)
  // worker.postMessage(
  //   {
  //     action: 'rendered',
  //     imageData: imageData,
  //     transform: rendererTransform,
  //     frameState: JSON.parse(stringify(frameState)),
  //   },
  //   [imageData]
  // )
})
