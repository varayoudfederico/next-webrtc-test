import type { NextPage } from "next";
import Head from "next/head";
import { SignalingClient, Role } from "amazon-kinesis-video-streams-webrtc";
import { useEffect, useRef } from "react";
import AWS from "aws-sdk";
import { login, getListOfDevices } from "../utils/api";

const cam1 = process.env.NEXT_PUBLIC_HUALAI_CHANNEL_CAM1;
const cam2 = process.env.NEXT_PUBLIC_HUALAI_CHANNEL_CAM2;
const cam3 = process.env.NEXT_PUBLIC_HUALAI_CHANNEL_CAM3;
const cam4 = process.env.NEXT_PUBLIC_HUALAI_CHANNEL_CAM4;

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

const Home: NextPage = () => {
  const videoPlayerRef = useRef();

  const getAccessToken = async () => {
    const data = await login();
    console.log("login data:", data);
    return data.data.access_token;
  };

  const getDevices = async () => {
    const access_token = await getAccessToken();
    const devices = await getListOfDevices(access_token);
    console.log("device data: ", devices.data.device_list);
  };

  const getCameraData = async (token, mac) => {
    console.log("getCameraData token: ", token, mac);
    const response = await fetch(`/api/cameraData?token=${token}&mac=${mac}`);
    const { data: cameraData } = await response.json();
    console.log("camera data: ", cameraData);
    return cameraData;
  };

  useEffect(() => {
    getDevices();
  }, []);

  const viewCamWithCredentials = async (cameraID) => {
    if (!videoPlayerRef.current) return;
    videoPlayerRef.current.srcObject = null;

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
        ChannelName: cameraID,
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
      if (videoPlayerRef.current.srcObject) {
        return;
      }
      const remoteStream = event.streams[0];
      videoPlayerRef.current.srcObject = remoteStream;
    });

    console.log("[VIEWER] Starting viewer connection");
    signalingClient.open();
  };

  class CustomSigner {
    constructor(_url) {
      this.url = _url;
    }

    getSignedURL() {
      return this.url;
    }
  }

  const viewCamWithoutCredentials = async () => {
    videoPlayerRef.current.srcObject = null;
    const token = await getAccessToken();
    const cameraData = await getCameraData(token, "A4DA2220000B");

    const natTraversalDisabled = false;
    const forceTURN = false;
    const useTrickleICE = true;
    const sendVideo = false;
    const sendAudio = false;

    const channelARN =
      "arn:aws:kinesisvideo:sa-east-1:183521707800:channel/45b2e3df654b8db299f38bba354814ac179e64f920752de5572fbe18df60f551/1637587134697";
    // const channelARN = describeSignalingChannelResponse.ChannelInfo.ChannelARN;
    console.log("[VIEWER] Channel ARN: ", channelARN);

    const endpointsByProtocol = {
      HTTPS: "https://r-8a36de0c.kinesisvideo.sa-east-1.amazonaws.com",
      WSS: "wss://v-b35a547e.kinesisvideo.sa-east-1.amazonaws.com",
    };
    console.log("[VIEWER] Endpoints: ", endpointsByProtocol);

    console.log("ice data arrived: ", cameraData.ice_uri);
    if (cameraData.ice_uri.turn_uri_list.length < 2) {
      console.log("No llegaron tdas las uris");
      return;
    } else {
      const mappedICEservers = [
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
      console.log("mapped: ", mappedICEservers);
      const iceServers = mappedICEservers;
      const signedURL = cameraData.wss_sign_url;
      // const convertedSignedURL = decodeURI(signedURL);
      console.log("signed url: ", signedURL);
      // console.log("convertedSignedURL url: ", convertedSignedURL);

      //Create Signaling Client
      const signalingClient = new SignalingClient({
        channelARN,
        channelEndpoint: endpointsByProtocol.WSS,
        role: Role.VIEWER,
        region: config.region,
        clientId: getRandomClientId(),
        // credentials,
        requestSigner: new CustomSigner(signedURL),
        systemClockOffset: 10000,
      });

      console.log("signalingClient", signalingClient);

      const configuration = {
        iceServers,
        iceTransportPolicy: forceTURN ? "relay" : "all",
      };

      const peerConnection = new RTCPeerConnection(configuration);

      signalingClient.on("open", async () => {
        console.log("[VIEWER] Connected to signaling service");

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
        if (videoPlayerRef.current.srcObject) {
          return;
        }
        const remoteStream = event.streams[0];
        videoPlayerRef.current.srcObject = remoteStream;
      });

      console.log("[VIEWER] Starting viewer connection");
      signalingClient.open();
    }
  };

  return (
    <div>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <h1>WebRTC Demo</h1>
        <div>
          <button onClick={() => viewCamWithoutCredentials()}>
            Ver camara 1 (Sin AWSID)
          </button>
          <button onClick={() => viewCamWithCredentials(cam1)}>
            Ver camara 1 (Con AWSID)
          </button>
          <button onClick={() => viewCamWithCredentials(cam2)}>
            Ver camara 2 (Con AWSID)
          </button>
          <button onClick={() => viewCamWithCredentials(cam3)}>
            Ver camara 3 (Con AWSID)
          </button>
          <button onClick={() => viewCamWithCredentials(cam4)}>
            Ver camara 4 (Con AWSID)
          </button>
        </div>
        <div className="video-container">
          <video
            ref={videoPlayerRef}
            className="remote-view"
            autoPlay
            playsInline
            controls
          />
        </div>
      </main>
    </div>
  );
};

export default Home;
