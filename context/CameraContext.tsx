import { createContext, useContext, useEffect, useRef, useState } from "react";
import { login, getListOfDevices, fetchCameraInfo } from "../utils/api";
import { SignalingClient, Role } from "amazon-kinesis-video-streams-webrtc";
import AWS from "aws-sdk";

class CustomSigner {
  constructor(_url) {
    this.url = _url;
  }

  getSignedURL() {
    return this.url;
  }
}

const defaultState = {
  cameras: [],
  videoRef: null,
  selectCamera: (cameraMac) => null,
  viewCamWithCredentials: (cameraChannel) => null,
};

const config = {
  region: process.env.NEXT_PUBLIC_REGION,
};

const credentials = {
  accessKeyId: process.env.NEXT_PUBLIC_ACCESS_KEY_ID,
  secretAccessKey: process.env.NEXT_PUBLIC_ACCESS_KEY_SECRET,
};

function getRandomClientId() {
  return Math.random().toString(36).substring(2).toUpperCase();
}

export const CameraContext = createContext(defaultState);

export const useCameraContext = () => useContext(CameraContext);

export const CameraProvider = ({ children }) => {
  const [cameras, setCameras] = useState([]);
  const videoRef = useRef();
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
    const { data } = await login();
    return data;
  };

  const getDevices = async () => {
    const { access_token } = await getAccessToken();
    const { data } = await getListOfDevices(access_token);
    setCameras(data.device_list);
  };

  const getCameraData = async (token, mac) => {
    const response = await fetchCameraInfo(token, mac);
    const { data: cameraData } = await response.json();
    return cameraData;
  };

  const viewCamWithCredentials = async (cameraChannel) => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = null;

    const natTraversalDisabled = false;
    const forceTURN = false;
    const useTrickleICE = true;
    const sendVideo = false;
    const sendAudio = false;

    const kinesisVideoClient = new AWS.KinesisVideo({
      region: config.region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      correctClockSkew: true,
    });

    const describeSignalingChannelResponse = await kinesisVideoClient
      .describeSignalingChannel({
        ChannelName: cameraChannel,
      })
      .promise();

    const channelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;
    console.log("[VIEWER] Channel ARN: ", channelARN);

    const getSignalingChannelEndpointResponse = await kinesisVideoClient
      .getSignalingChannelEndpoint({
        ChannelARN: channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ["WSS", "HTTPS"],
          Role: Role.VIEWER,
        },
      })
      .promise();

    console.log(
      "getSignalingChannelEndpointResponse",
      getSignalingChannelEndpointResponse
    );

    const endpointsByProtocol =
      getSignalingChannelEndpointResponse.ResourceEndpointList.reduce(
        (endpoints, endpoint) => {
          endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
          return endpoints;
        },
        {}
      );
    console.log("[VIEWER] Endpoints: ", endpointsByProtocol);

    const kinesisVideoSignalingChannelsClient =
      new AWS.KinesisVideoSignalingChannels({
        region: config.region,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        endpoint: endpointsByProtocol.HTTPS,
        correctClockSkew: true,
      });

    console.log(
      "kinesisVideoSignalingChannelsClient",
      kinesisVideoSignalingChannelsClient
    );

    // Get ICE server configuration
    const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
      .getIceServerConfig({
        ChannelARN: channelARN,
      })
      .promise();

    const iceServers = [];

    if (!natTraversalDisabled && !forceTURN) {
      iceServers.push({
        urls: `stun:stun.kinesisvideo.${config.region}.amazonaws.com:443`,
      });
    }

    if (!natTraversalDisabled) {
      getIceServerConfigResponse.IceServerList.forEach((iceServer) =>
        iceServers.push({
          urls: iceServer.Uris,
          username: iceServer.Username,
          credential: iceServer.Password,
        })
      );
    }
    console.log("[VIEWER] ICE servers: ", iceServers);
    console.log(
      "kinesisVideoClient.config.systemClockOffset ",
      kinesisVideoClient.config.systemClockOffset
    );

    // let queryParams = {
    //   "X-Amz-ChannelARN": channelARN,
    // };
    // const signer = new SigV4RequestSigner(config.region, credentials);
    // const url = await signer.getSignedURL(endpointsByProtocol.WSS, queryParams);
    // console.log("locally signed url: ", url);
    // Create Signaling Client
    const signalingClient = new SignalingClient({
      channelARN,
      channelEndpoint: endpointsByProtocol.WSS,
      role: Role.VIEWER,
      clientId: getRandomClientId(),
      region: config.region,
      credentials,
      // requestSigner: new CustomSigner(url),
      systemClockOffset: kinesisVideoClient.config.systemClockOffset,
    });

    console.log("signalingClient", signalingClient);

    const resolution = config.widescreen
      ? { width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 640 }, height: { ideal: 480 } };

    const constraints = {
      video: sendVideo ? resolution : false,
      audio: sendAudio,
    };

    const configuration = {
      iceServers,
      iceTransportPolicy: forceTURN ? "relay" : "all",
    };

    const peerConnection = new RTCPeerConnection(configuration);

    signalingClient.on("open", async () => {
      console.log("[VIEWER] Connected to signaling service");

      // Get a stream from the webcam, add it to the peer connection, and display it in the local view.
      // If no video/audio needed, no need to request for the sources.
      // Otherwise, the browser will throw an error saying that either video or audio has to be enabled.
      if (sendVideo || sendAudio) {
        // try {
        //     viewer.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        //     viewer.localStream.getTracks().forEach(track => viewer.peerConnection.addTrack(track, viewer.localStream));
        //     localView.srcObject = viewer.localStream;
        // } catch (e) {
        //     console.error('[VIEWER] Could not find webcam');
        //     return;
        // }
      }

      // Create an SDP offer to send to the master
      console.log("[VIEWER] Creating SDP offer");
      await peerConnection.setLocalDescription(
        await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
      );

      // When trickle ICE is enabled, send the offer now and then send ICE candidates as they are generated. Otherwise wait on the ICE candidates.
      if (useTrickleICE) {
        console.log("[VIEWER] Sending SDP offer");
        signalingClient.sendSdpOffer(peerConnection.localDescription);
      }
      console.log("[VIEWER] Generating ICE candidates");
    });

    signalingClient.on("sdpAnswer", async (answer) => {
      // Add the SDP answer to the peer connection
      console.log("[VIEWER] Received SDP answer");
      await peerConnection.setRemoteDescription(answer);
    });

    signalingClient.on("iceCandidate", (candidate) => {
      // Add the ICE candidate received from the MASTER to the peer connection
      console.log("[VIEWER] Received ICE candidate");
      peerConnection.addIceCandidate(candidate);
    });

    signalingClient.on("close", () => {
      console.log("[VIEWER] Disconnected from signaling channel");
    });

    signalingClient.on("error", (error) => {
      console.error("[VIEWER] Signaling client error: ", error);
    });

    // Send any ICE candidates to the other peer
    peerConnection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) {
        console.log("[VIEWER] Generated ICE candidate");

        // When trickle ICE is enabled, send the ICE candidates as they are generated.
        if (useTrickleICE) {
          console.log("[VIEWER] Sending ICE candidate");
          signalingClient.sendIceCandidate(candidate);
        }
      } else {
        console.log("[VIEWER] All ICE candidates have been generated");

        // When trickle ICE is disabled, send the offer now that all the ICE candidates have ben generated.
        if (!useTrickleICE) {
          console.log("[VIEWER] Sending SDP offer");
          signalingClient.sendSdpOffer(peerConnection.localDescription);
        }
      }
    });

    // As remote tracks are received, add them to the remote view
    peerConnection.addEventListener("track", (event) => {
      console.log("[VIEWER] Received remote track");
      if (videoRef.current.srcObject) {
        return;
      }
      const remoteStream = event.streams[0];
      videoRef.current.srcObject = remoteStream;
    });

    console.log("[VIEWER] Starting viewer connection");
    signalingClient.open();
  };

  const viewCam = async (cameraMAC) => {
    //Detener conexiones previamente generadas
    stopCurrentViewer();

    //Setear el src del video actual en null
    if (!videoRef || !videoRef.current) return;
    videoRef.current.srcObject = null;

    //Obtener el access_token de la cuenta actual (en este momento hardcodeada, en un futuro viene del IDP)
    const { access_token } = await getAccessToken();

    //Con el access_token obtenido, obtener los datos de la cámara.
    const cameraData = await getCameraData(access_token, cameraMAC);

    //Datos hardcodeados temporalmente que se deberían obtener de cameraData cuando funcione.
    const channelARN =
      "arn:aws:kinesisvideo:sa-east-1:183521707800:channel/45b2e3df654b8db299f38bba354814ac179e64f920752de5572fbe18df60f551/1637587134697";
    const channelEndpoint =
      "wss://v-b35a547e.kinesisvideo.sa-east-1.amazonaws.com";

    //En algunas situaciones el backend no envia los datos suficientes, en este caso se corta la conexión.
    if (cameraData.ice_uri.turn_uri_list.length < 2) {
      console.log("Faltan URLs de ICE, reintentar.");
      return;
    }

    //Estos son los datos para iniciar la conexión webRTC que llega de backend.
    //Se lo mapea para que sea compatible con el formato de KVS.
    const iceServers = [
      {
        urls: cameraData.ice_uri.stun_uri,
      },
      {
        urls: cameraData.ice_uri.turn_uri_list[0].uris,
        username: cameraData.ice_uri.turn_uri_list[0].username,
        credential: cameraData.ice_uri.turn_uri_list[0].password,
      },
      {
        urls: cameraData.ice_uri.turn_uri_list[1].uris,
        username: cameraData.ice_uri.turn_uri_list[1].username,
        credential: cameraData.ice_uri.turn_uri_list[1].password,
      },
    ];

    //Esta URL es la que se usa para iniciar la conexión webSocket.
    //Actualmente no esta funcionando, por lo que se debe usar las credentials de AWS.
    const signedURL = cameraData.wss_sign_url;
    console.log("Signed URL: ", signedURL);
    console.log("ICE Servers: ", iceServers);

    //El signalingClient es el que se encarga de comunicarse con la camara a través de un webSocket.
    //Los parametros channelARN, channelEndpoint, y region no van a ser necesarios cuando la signedURL funcione.
    viewer.signalingClient = new SignalingClient({
      channelARN,
      channelEndpoint,
      role: Role.VIEWER,
      region: config.region,
      clientId: getRandomClientId(),
      credentials,
      // requestSigner: new CustomSigner(signedURL),
      systemClockOffset: 0,
    });
    console.log("signalingClient", viewer.signalingClient);

    //Objeto que contiene toda la información necesaria para iniciar la conexión webRTC.
    const RTCconfiguration = {
      iceServers,
      iceTransportPolicy: "all",
    };
    viewer.peerConnection = new RTCPeerConnection(RTCconfiguration);

    //Añado eventos al websocket:

    //Cuando el websocket esta listo para recibir mensajes, se inicia la conexión webRTC enviando la SDPOffer.
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

    //Cuando llega una respuesta SDP, se agrega a la conexión webRTC.
    viewer.signalingClient.on("sdpAnswer", async (answer) => {
      await viewer.peerConnection.setRemoteDescription(answer);
    });

    //Cuando llega un ICE candidate, se agrega a la conexión webRTC.
    viewer.signalingClient.on("iceCandidate", (candidate) => {
      viewer.peerConnection.addIceCandidate(candidate);
    });

    viewer.signalingClient.on("close", () => {
      console.log("Conexión finalizada");
    });

    viewer.signalingClient.on("error", (error) => {
      console.error("Error en el signalingClient: ", error);
    });

    //Enviar todos los candidatos ICE generados al backend.
    viewer.peerConnection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) {
        viewer.signalingClient.sendIceCandidate(candidate);
      } else {
        console.log("Se generaron todos los candidatos de conexión.");
      }
    });

    //Cuando se reciben pistas de video, mostrarlas en el reproductor.
    viewer.peerConnection.addEventListener("track", (event) => {
      console.log("Se recibió respuesta de una cámara");
      const remoteStream = event.streams[0];
      if (videoRef && videoRef.current)
        videoRef.current.srcObject = remoteStream;
    });

    console.log("Iniciando conexión con la cámara...");
    //Iniciar el webSocket.
    viewer.signalingClient.open();
  };

  function stopCurrentViewer() {
    if (viewer.signalingClient) {
      console.log("Deteniendo signalingClient actual");
      viewer.signalingClient.close();
      viewer.signalingClient = null;
    }

    if (viewer.peerConnection) {
      console.log("Deteniendo peerConnection actual");
      viewer.peerConnection.close();
      viewer.peerConnection = null;
    }
  }

  return (
    <CameraContext.Provider
      value={{ cameras, videoRef, selectCamera, viewCamWithCredentials }}
    >
      {children}
    </CameraContext.Provider>
  );
};
