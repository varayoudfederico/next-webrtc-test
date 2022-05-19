import "../styles/globals.css";
import type { AppProps } from "next/app";
import { CameraProvider } from "../context/CameraContext";
import "webrtc-adapter";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <CameraProvider>
      <Component {...pageProps} />
    </CameraProvider>
  );
}

export default MyApp;
