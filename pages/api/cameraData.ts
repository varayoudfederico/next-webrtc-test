// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import CryptoJS from "crypto-js";
import { v4 as uuidv4 } from "uuid";

const url = process.env.NEXT_PUBLIC_HUALAI_URL;
const phone_id = process.env.NEXT_PUBLIC_HUALAI_PHONEID;

type Data = {
  name: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const access_token = req.query.token;
  const mac = req.query.mac;
  console.log("access_token", access_token);
  console.log("mac", mac);
  const timestamp = new Date().getTime();
  const terminal_id = phone_id.replace(/-/g, "");
  const request_id = uuidv4().replace(/-/g, "");
  // console.log("request_id", request_id);
  // console.log("terminal_id", terminal_id);
  const cameraData = {
    app_name: "com.hualai.geniuslife",
    request_id: "f3485e42f1dc47e88950500d54fb8521",
    timestamp,
    data: {
      device_id: mac,
      client_id: "229285051375271936",
    },
    app_version: "1.0.2",
    os_name: "Android",
    os_version: "4.19.132",
    terminal_id: "c80624d4-0fe8-423f-a870-125e3b7a52a7",
  };
  console.log("cameraData", cameraData);

  const response = await fetch(`https://${url}/webrtc/v1/auth/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "H-AccessToken": access_token,
    },
    body: JSON.stringify(cameraData),
  });
  const data = await response.json();
  res.status(200).json(data);
}
