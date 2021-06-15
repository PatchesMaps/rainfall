import React from 'react'
import {
  Map,
  Popup,
  TabbedPanel,
  Controls,
  ContextMenu,
  LayerStyler,
  LayerPanelLayersPage,
  TabbedPanelPage,
  BasemapContainer,
  DrawContainer,
} from '@bayer/ol-kit'

import Rainfall from './Rainfall'

class App extends React.Component {
  constructor () {
    super()
    this.state = {
      map: null
    }
  }
  onMapInit = async (map) => {
    window.olMap = map
    this.setState({ map })
  }

  render() {
    const { map } = this.state
    return (
      <Map onMapInit={this.onMapInit} fullScreen>
        <Popup />
        <TabbedPanel>
          <TabbedPanelPage  label='Layers'>
            <LayerPanelLayersPage />
          </TabbedPanelPage>
          <TabbedPanelPage label='Styles'>
            <LayerStyler />
          </TabbedPanelPage>
          <TabbedPanelPage label='Draw'>
            <DrawContainer style={{ position: 'relative', width: 'auto' }} />
          </TabbedPanelPage>
        </TabbedPanel>
        <ContextMenu />
        <Controls />
        <BasemapContainer />
        <Rainfall map={map} />
      </Map>
    )
  }
}

export default App
