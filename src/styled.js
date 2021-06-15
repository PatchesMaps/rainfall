import styled from 'styled-components'

export const RainCanvas = styled.canvas`
  position: absolute;
  width: ${props => props.rect.width ? `${props.rect.width}px` : '100%'};
  height: ${props => props.rect.height ? `${props.rect.height}px` : '100%'};
  top: ${props => props.rect.y ? props.rect.y : '0'}px;
  left: ${props => props.rect.x ? props.rect.x : '0'}px;
  transformOrigin: top left;
  z-index: 999999999;
  pointer-events: none;
`
export const Container = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
`
export const TransformContainer = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
`