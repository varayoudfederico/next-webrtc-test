import { createContext, useContext, useEffect, useRef, useState } from "react";
import { fetchLogin, fetchListOfDevices, fetchCameraInfo } from "../utils/api";
import { SignalingClient, Role } from "amazon-kinesis-video-streams-webrtc";

function getRandomClientId() {
  return Math.random().toString(36).substring(2).toUpperCase();
}

const defaultState = {
  cameras: [],
  videoRef: null,
  selectCamera: (cameraMac: string) => null,
  loading: false,
  error: "",
};

export const CameraContext = createContext(defaultState);

export const useCameraContext = () => useContext(CameraContext);

export const CameraProvider = ({ children }) => {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>();

  let viewer = {
    signalingClient: null,
    peerConnection: null,
  };

  useEffect(() => {
    getDevices();
  }, []);

  const selectCamera = (cameraMAC) => {
    console.log("Iniciar el stream de la camara: ", cameraMAC);
    viewCam(cameraMAC);
  };

  const getAccessToken = async () => {
    const { data } = await fetchLogin();
    return data;
  };

  const getDevices = async () => {
    const { access_token } = await getAccessToken();
    const { data } = await fetchListOfDevices(access_token);
    setCameras(data.device_list);
  };

  const getCameraData = async (token, mac) => {
    const response = await fetchCameraInfo(token, mac);
    const { data: cameraData } = await response.json();
    return cameraData;
  };

  const viewCam = async (cameraMAC) => {
    setLoading(true);
    setError("");

    //Detener conexiones previamente generadas
    stopCurrentViewer();

    if (!videoRef || !videoRef.current) return;
    videoRef.current.srcObject = null;

    try {
      const { access_token } = await getAccessToken();
      //Con el access_token obtener los datos de la cámara.
      const cameraData = await getCameraData(access_token, cameraMAC);

      const iceServers = [
        {
          urls: cameraData.ice_uri.stun_uri,
        },
      ];

      console.log("ICE Servers: ", cameraData.ice_uri.turn_uri_list.length);

      cameraData.ice_uri.turn_uri_list.forEach((item) => {
        const turnServer = {
          urls: item.uris,
          username: item.username,
          credential: item.password,
        };
        iceServers.push(turnServer);
      });

      console.log("ICE Servers: ", iceServers);

      //Esta URL es la que se usa para iniciar la conexión webSocket.
      const wssURL = decodeURI(cameraData.wss_sign_url);

      //El signalingClient es el que se encarga de comunicarse con la camara a través de un webSocket.
      //Los parametros channelARN, channelEndpoint, y region los obtiene de la signedURL, pero no pueden estar vacios asi que se envia cualquier caracter.
      viewer.signalingClient = new SignalingClient({
        channelARN: "_",
        channelEndpoint: "_",
        role: Role.VIEWER,
        region: "_",
        clientId: getRandomClientId(),
        requestSigner: {
          getSignedURL: () => {
            return new Promise((resolve) => {
              resolve(wssURL);
            });
          },
        },
        systemClockOffset: 0,
      });
      console.log("SignalingClient: ", viewer.signalingClient);

      //Objeto que contiene toda la información necesaria para iniciar la conexión webRTC.
      const RTCconfiguration = {
        iceServers,
      };
      viewer.peerConnection = new RTCPeerConnection(RTCconfiguration);

      //Se definen todos los handlers de los eventos que pueden llegar por el websocket:
      viewer.signalingClient.on("open", async () => {
        const offer = await viewer.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await viewer.peerConnection.setLocalDescription(offer);
        viewer.signalingClient.sendSdpOffer(
          viewer.peerConnection.localDescription
        );
      });

      viewer.signalingClient.on("sdpAnswer", async (answer) => {
        await viewer.peerConnection.setRemoteDescription(answer);
      });

      viewer.signalingClient.on("iceCandidate", (candidate) => {
        viewer.peerConnection.addIceCandidate(candidate);
      });

      viewer.signalingClient.on("close", () => {
        stopCurrentViewer();
        console.log("Conexión finalizada");
      });

      viewer.signalingClient.on("error", (error) => {
        console.error("Error en el signalingClient: ", error);
      });

      viewer.peerConnection.addEventListener(
        "icecandidate",
        ({ candidate }) => {
          if (candidate) {
            viewer.signalingClient.sendIceCandidate(candidate);
          } else {
            console.log("Se generaron todos los candidatos de conexión.");
            console.log("Esperando respuesta de la cámara...");
          }
        }
      );

      //Cuando se reciben pistas de video, mostrarlas en el reproductor.
      viewer.peerConnection.addEventListener("track", (event) => {
        console.log("Se recibió respuesta de una cámara.");
        const remoteStream = event.streams[0];
        if (videoRef && videoRef.current) {
          setLoading(false);
          videoRef.current.srcObject = remoteStream;
        }
      });

      console.log("Iniciando conexión con la cámara...");
      //Iniciar el webSocket.
      viewer.signalingClient.open();
    } catch (e) {
      setLoading(false);
      setError("Error: " + e);
    }
  };

  function stopCurrentViewer() {
    if (viewer.signalingClient) {
      console.log("Deteniendo signalingClient actual.");
      viewer.signalingClient.close();
      viewer.signalingClient = null;
    }

    if (viewer.peerConnection) {
      console.log("Deteniendo peerConnection actual.");
      viewer.peerConnection.close();
      viewer.peerConnection = null;
    }
  }

  return (
    <CameraContext.Provider
      value={{
        cameras,
        videoRef,
        selectCamera,
        loading,
        error,
      }}
    >
      {children}
    </CameraContext.Provider>
  );
};
