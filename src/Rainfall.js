import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import { Container, RainCanvas, TransformContainer } from './styled'
import Worker from "worker-loader!./worker.js" // eslint-disable-line
import {Image as ImageLayer, Tile as TileLayer, Layer} from 'ol/layer'
import { Source, TileWMS, ImageWMS } from 'ol/source'
import { compose, create } from 'ol/transform'
import { createTransformString } from 'ol/render/canvas'
// import { createXYZ } from 'ol/tilegrid'
import stringify from 'json-stringify-safe'

class Rainfall extends React.Component {
  constructor(props) {
    super(props)

    this.canvas = React.createRef()
    this.container = React.createRef()
    this.transformContainer = React.createRef()
    this.rendering = false
    this.state = {
      layers: []
    }
  }

  // Transform the container to account for the differnece between the (newer)
  // main thread frameState and the (older) worker frameState
  updateContainerTransform () {
    if (this.workerFrameState) {
      const viewState = this.mainThreadFrameState.viewState
      const renderedViewState = this.workerFrameState.viewState
      const center = viewState.center
      const resolution = viewState.resolution
      const rotation = viewState.rotation
      const renderedCenter = renderedViewState.center
      const renderedResolution = renderedViewState.resolution
      const renderedRotation = renderedViewState.rotation
      const transform = create()
      // Skip the extra transform for rotated views, because it will not work
      // correctly in that case
      if (!rotation) {
        compose(
          transform,
          (renderedCenter[0] - center[0]) / resolution,
          (center[1] - renderedCenter[1]) / resolution,
          renderedResolution / resolution,
          renderedResolution / resolution,
          rotation - renderedRotation,
          0,
          0
        )
      }
      this.transformContainer.style.transform = createTransformString(transform)
    }
  }

  componentDidMount() {
    this.worker = new Worker('/worker.js', { type: 'module', name: 'raincloud', credentials: 'same-origin' })

    const { map } = this.props
    // create a vector layer and add to the map
    const aspect = new ImageWMS({
      url: 'https://elevation.nationalmap.gov:443/arcgis/services/3DEPElevation/ImageServer/WMSServer',
      params: {
        LAYERS: '3DEPElevation:Aspect Degrees'
      },
      crossOrigin: 'anonymous'
    })
    const weather = new TileWMS({
      attributions: ['Iowa State University'],
      url: 'https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Observations/radar_base_reflectivity/MapServer',
      params: { 'LAYERS': 'radar_base_reflectivity' },
    })
    const weatherLayer = new TileLayer({
      title: 'Weather Radar',
      source: weather,
    })
    const aspectLayer = new ImageLayer({
      className: 'aspect',
      title: 'Aspect - Degrees',
      source: aspect,
    })

    const raindrops = new Layer({
      title: 'Raindrops',
      render: (frameState) => {
        if (!this.container) {
          this.container = document.createElement('div')
          this.container.style.position = 'absolute'
          this.container.style.width = '100%'
          this.container.style.height = '100%'
          this.transformContainer = document.createElement('div')
          this.transformContainer.style.position = 'absolute'
          this.transformContainer.style.width = '100%'
          this.transformContainer.style.height = '100%'
          this.container.appendChild(this.transformContainer)
          this.canvas = document.createElement('canvas')
          this.canvas.style.position = 'absolute'
          this.canvas.style.left = '0'
          this.canvas.style.transformOrigin = 'top left'
          this.transformContainer.appendChild(this.canvas)
        }
        this.mainThreadFrameState = frameState
        this.updateContainerTransform()
        if (!this.rendering) {
          this.rendering = true
          this.worker.postMessage({
            action: 'render',
            frameState: JSON.parse(stringify(frameState)),
          })
        } else {
          frameState.animate = true
        }
        return this.container.current
      },
      source: new Source({
        attributions: [
          '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a>',
          '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>'],
      }),
    })

    // Worker messaging and actions
    this.worker.addEventListener('message', function (message) {
      if (message.data.action === 'loadImage') {
        // Image loader for ol-mapbox-style
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.addEventListener('load', function () {
          createImageBitmap(image, 0, 0, image.width, image.height).then(
            function (imageBitmap) {
              this.worker.postMessage(
                {
                  action: 'imageLoaded',
                  image: imageBitmap,
                  src: message.data.src,
                },
                [imageBitmap]
              )
            }
          )
        })
        image.src = message.data.src
      } else if (message.data.action === 'requestRender') {
        // Worker requested a new render frame
        map.render()
      } else if (this.canvas && message.data.action === 'rendered') {
        // Worker provies a new render frame
        requestAnimationFrame(function () {
          const imageData = message.data.imageData
          this.canvas.width = imageData.width
          this.canvas.height = imageData.height
          this.canvas.getContext('2d').drawImage(imageData, 0, 0)
          this.canvas.style.transform = message.data.transform
          this.workerFrameState = message.data.frameState
          this.updateContainerTransform()
        })
        this.rendering = false
      }
    })

    // this.addLayer(aspectLayer)
    this.addLayer(raindrops)
    // this.addLayer(aspectLayer)
  }

  addLayer(layer) {
    this.setState({ layers: [...this.state.layers, layer] }, () => this.props.map.addLayer(layer))
  }

  componentWillUnmount() {
    const { map } = this.props
    const { layers } = this.state

    layers.forEach(map.removeLayer)
    this.worker.terminate()
  }

  render() {
    const { map } = this.props
    const target = map.getTargetElement()
    const boundingRect = target.getBoundingClientRect()
    return ReactDOM.createPortal(
      <Container ref={this.container}>
        <TransformContainer ref={this.transformContainer}>
          <RainCanvas id='rainfall' rect={boundingRect} ref={this.canvas} />
        </TransformContainer>
      </Container>,
      document.body
    )
    // return true
  }
}

export default Rainfall

Rainfall.propTypes = {
  map: PropTypes.object.isRequired,
  onEnd: PropTypes.func
}
Rainfall.defaultProps = {
  onEnd: () => {}
}
