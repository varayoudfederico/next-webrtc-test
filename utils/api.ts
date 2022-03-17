import CryptoJS from "crypto-js";

const url = process.env.NEXT_PUBLIC_HUALAI_URL;
const phone_id = process.env.NEXT_PUBLIC_HUALAI_PHONEID;

export const fetchLogin = async () => {
  console.log("Iniciando sesión...");
  const timestamp = new Date().getTime();
  const password = process.env.NEXT_PUBLIC_HUALAI_PASSWORD;
  const MD5password = CryptoJS.MD5(
    CryptoJS.MD5(password).toString()
  ).toString();

  const loginData = {
    phone_id,
    app_name: "com.hualai.geniuslife",
    app_version: "1.0.2",
    login_type: 1,
    sc: process.env.NEXT_PUBLIC_HUALAI_SC,
    sv: process.env.NEXT_PUBLIC_HUALAI_SV,
    password: MD5password,
    user_name: process.env.NEXT_PUBLIC_HUALAI_USERNAME,
    phone_system_type: 2,
    ts: timestamp,
  };

  const res = await fetch(`https://${url}/app/v1/user/login`, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(loginData),
  });
  const data = await res.json();
  return data;
};

export const fetchListOfDevices = async (token) => {
  console.log("Obteniendo lista de cámaras...");
  const timestamp = new Date().getTime();

  const listOfDevicesData = {
    phone_id,
    app_name: "com.hualai.geniuslife",
    app_ver: "1.0.4",
    app_version: "1.0.2",
    sc: process.env.NEXT_PUBLIC_HUALAI_SC,
    sv: process.env.NEXT_PUBLIC_HUALAI_SV,
    phone_system_type: 2,
    ts: timestamp,
    access_token: token,
  };

  const res = await fetch(`https://${url}/app/v1/device/device_list/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(listOfDevicesData),
  });
  const data = await res.json();
  return data;
};

export const fetchCameraInfo = (token, mac) => {
  console.log("Obteniendo datos de la cámara: ", mac);
  return fetch(`/api/cameraData?token=${token}&mac=${mac}`);
};
