import CryptoJS from "crypto-js";
import { v4 as uuidv4 } from "uuid";

const url = process.env.NEXT_PUBLIC_HUALAI_URL;
const phone_id = process.env.NEXT_PUBLIC_HUALAI_PHONEID;

export const login = async () => {
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
    sc: "c2ff9183ac6747479ec341e7b1356ab3",
    password: MD5password,
    // sv: "db1f83b67d634de88f86b49fde92dea1",
    user_name: process.env.NEXT_PUBLIC_HUALAI_USERNAME,
    phone_system_type: 2,
    ts: timestamp,
    // verify_code: "",
    // access_token: "",
  };
  // console.log("login_data", loginData);
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

export const getListOfDevices = async (token) => {
  const timestamp = new Date().getTime();
  const listOfDevicesData = {
    phone_id,
    app_name: "com.hualai.geniuslife",
    app_ver: "1.0.4",
    app_version: "1.0.2",
    sc: "c2ff9183ac6747479ec341e7b1356ab3",
    sv: "db1f83b67d634de88f86b49fde92dea1",
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
