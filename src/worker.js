import TileQueue from 'ol/TileQueue'
import {
  Image as ImageLayer,
  Vector as VectorLayer
} from 'ol/layer'
import { ImageWMS, Vector } from 'ol/source'
import stringify from 'json-stringify-safe'
import { Projection } from 'ol/proj'
import { inView } from 'ol/layer/Layer'
import { getTilePriority as tilePriorityFunction } from 'ol/TileQueue'

console.log('WORKER')

/** @type {any} */
const worker = self // eslint-disable-line

let frameState, pixelRatio, rendererTransform
const canvas = new OffscreenCanvas(1, 1)
// OffscreenCanvas does not have a style, so we mock it
canvas.style = {}
const context = canvas.getContext('2d')

const sources = {
  aspect: new ImageWMS({
    url: 'https://elevation.nationalmap.gov:443/arcgis/services/3DEPElevation/ImageServer/WMSServer',
    params: {
      LAYERS: '3DEPElevation:Aspect Degrees'
    },
    crossOrigin: 'anonymous'
  }),
  weather: new ImageWMS({
    attributions: ['Iowa State University'],
    url: 'https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/radar_base_reflectivity/MapServer',
    params: { 'LAYERS': 'radar_base_reflectivity' },
  }),
  vector: new Vector()
}
const layers = [
  new ImageLayer({ source: sources.aspect }),
  new ImageLayer({ source: sources.weather }),
  new VectorLayer({ source: sources.vector })
()]
const raindrops = []

function Raindrop(cx, cy, color, size = 1) {
  let x = cx // eslint-disable-line newline-after-var
  let y = cy
  const baseX = x
  const baseY = y
  const inertia = (Math.random() * 10) + 2 // The particles moment of inertia or how much it is going to resis the force we apply to it. This is random so that eacch particle behaves slightly differently
  function draw(ctx) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, size, size) // we use fillRect because it is more performant than arc
  }
  // calculate the particle's physics
  function update(mouse, ctx, rect, dpr) {
    const dx = (mouse.x * dpr) - (x + (rect.x * dpr))
    const dy = (mouse.y * dpr) - (y + (rect.y * dpr))
    const distance = Math.sqrt(dx * dx + dy * dy)
    const forceDirectionX = dx / distance
    const forceDirectionY = dy / distance
    const maxDistance = 100
    let force = (maxDistance - distance) / maxDistance
    if (force < 0) force = 0
    const directionX = (forceDirectionX * force * inertia * 1.5)
    const directionY = (forceDirectionY * force * inertia * 1.5)
    if (distance < (mouse.radius * dpr) + size) {
      x -= directionX
      y -= directionY
    } else {
      if (x !== baseX) {
        const dx = x - baseX
        x -= dx / 20
      }
      if (y !== baseY) {
        const dy = y - baseY
        y -= dy / 20
      }
    }
    draw(ctx)
  }

  return {
    draw,
    update
  }
}

// constructs an array of particles from the passed ImageData object
function atomize(imgData) {
  const { data, height, width } = imgData
  const step = 6 * this.devicePixelRatio // effectively the divisor to downsample our image by. low step value = higher image quality = lower performance and vice versa
  let n = 0
  for (let y = 0, y2 = height; y <= y2; y += step) { // Scan the image by every nth column for every nth row.
    for (let x = 0, x2 = width; x <= x2; x += step) {
      // const indices = getColorIndicesForCoord(x, y, width) // get the indeces of the rgba values in our ImageData object for the given coordinate
      // const color = `rgba(${data[indices[0]]}, ${data[indices[1]]}, ${data[indices[2]]}, ${data[indices[3]] / 255})`
      const color = 'rgba(0, 200, 50, 255)'
      raindrops.splice(n, 1, Raindrop(x, y, color, step))
      n++
    }
  }
}

function animate() {
  return function () {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height) // clear the canvas
    raindrops.forEach(particle => particle.update(this.mouse, context, this.rect, this.devicePixelRatio)) // calculate the new position for and draw each particle
    requestAnimationFrame(animate()) // recursively calls animate for each frame
  }
}

// Font replacement so we do not need to load web fonts in the worker
// function getFont(font) {
//   return font[0].replace('Noto Sans', 'serif').replace('Roboto', 'sans-serif')
// }

// function loadStyles() {
//   const styleUrl =
//     'https://api.maptiler.com/maps/topo/style.json?key=Get your own API key at https://www.maptiler.com/cloud/'

//   fetch(styleUrl)
//     .then((data) => data.json())
//     .then((styleJson) => {
//       const buckets = []
//       let currentSource
//       styleJson.layers.forEach((layer) => {
//         if (!layer.source) {
//           return
//         }
//         if (currentSource !== layer.source) {
//           currentSource = layer.source
//           buckets.push({
//             source: layer.source,
//             layers: [],
//           })
//         }
//         buckets[buckets.length - 1].layers.push(layer.id)
//       })

//       const spriteUrl =
//         styleJson.sprite + (pixelRatio > 1 ? '@2x' : '') + '.json'
//       const spriteImageUrl =
//         styleJson.sprite + (pixelRatio > 1 ? '@2x' : '') + '.png'
//       fetch(spriteUrl)
//         .then((data) => data.json())
//         .then((spriteJson) => {
//           buckets.forEach((bucket) => {
//             const source = sources[bucket.source]
//             if (!source) {
//               return
//             }
//             const layer = new VectorTileLayer({
//               declutter: true,
//               source,
//               minZoom: source.getTileGrid().getMinZoom(),
//             })
//             layer.getRenderer().useContainer = function (target, transform) {
//               this.containerReused = this.getLayer() !== layers[0]
//               this.canvas = canvas
//               this.context = context
//               this.container = {
//                 firstElementChild: canvas,
//               }
//               rendererTransform = transform
//             }
//             styleFunction(
//               layer,
//               styleJson,
//               bucket.layers,
//               undefined,
//               spriteJson,
//               spriteImageUrl,
//               getFont
//             )
//             layers.push(layer)
//           })
//           worker.postMessage({ action: 'requestRender' })
//         })
//     })
// }

// Minimal map-like functionality for rendering

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

worker.addEventListener('message', (event) => {
  console.log('event:', event)
  if (event.data.action !== 'render') {
    return
  }
  frameState = event.data.frameState
  if (!pixelRatio) {
    pixelRatio = frameState.pixelRatio
    // loadStyles()
  }
  frameState.tileQueue = tileQueue
  frameState.viewState.projection.__proto__ = Projection.prototype
  layers.forEach((layer) => {
    if (inView(layer.getLayerState(), frameState.viewState)) {
      const renderer = layer.getRenderer()
      renderer.renderFrame(frameState, canvas)
    }
  })
  layers.forEach((layer) => layer.renderDeclutter(frameState))
  if (tileQueue.getTilesLoading() < maxTotalLoading) {
    tileQueue.reprioritize()
    tileQueue.loadMoreTiles(maxTotalLoading, maxNewLoads)
  }
  const imageData = canvas.transferToImageBitmap()
  worker.postMessage(
    {
      action: 'rendered',
      imageData: imageData,
      transform: rendererTransform,
      frameState: JSON.parse(stringify(frameState)),
    },
    [imageData]
  )
})
