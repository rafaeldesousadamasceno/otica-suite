import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

// Funcoes puras compartilhadas com os graficos dos relatorios em PDF (main).
export { niceTicks, formatarBRLCompacto, retanguloTopoArredondado } from '@shared/graficos'

/** Mede a largura do elemento e acompanha redimensionamento da janela. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setLargura(el.clientWidth)
    const observer = new ResizeObserver((entries) => setLargura(entries[0].contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, largura]
}
