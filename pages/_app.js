import Head from 'next/head'
import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>SharePass</title>
        <meta
          name="description"
          content="SharePass is an anonymous emotional support experience for reflection, gentle AI companionship, and safe self-expression."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
