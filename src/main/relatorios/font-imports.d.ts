// `import fonte from '...woff2?inline'`: o Vite embute o arquivo como data: URL
// (base64) no bundle do main - os PDFs saem com a mesma fonte do app, sem
// depender do que esta instalado no Windows.
declare module '*.woff2?inline' {
  const dataUrl: string
  export default dataUrl
}
