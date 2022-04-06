// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";

const url = process.env.NEXT_PUBLIC_HUALAI_URL;
const phone_id = process.env.NEXT_PUBLIC_HUALAI_PHONEID;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const access_token = req.query.token as string;
  const mac = req.query.mac;
  const timestamp = new Date().getTime();
  const request_id = uuidv4().replace(/-/g, "");

  const cameraData = {
    app_name: "com.hualai.geniuslife",
    request_id,
    timestamp,
    data: {
      device_id: mac,
      client_id: "229285051375271936",
    },
    app_version: "1.0.2",
    os_name: "Android",
    os_version: "4.19.132",
    terminal_id: phone_id,
  };

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
