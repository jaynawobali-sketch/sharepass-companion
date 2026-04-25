import Head from 'next/head'
import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  const faviconVersion = "20260425-2";

  return (
    <>
      <Head>
        <title>SharePass</title>
        <meta
          name="description"
          content="SharePass is an anonymous emotional support experience for reflection, gentle AI companionship, and safe self-expression."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href={`/favicon.ico?v=${faviconVersion}`} sizes="any" />
        <link rel="icon" type="image/png" sizes="512x512" href={`/favicon.png?v=${faviconVersion}`} />
        <link rel="shortcut icon" href={`/favicon.ico?v=${faviconVersion}`} />
        <link rel="apple-touch-icon" href={`/favicon.png?v=${faviconVersion}`} />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
