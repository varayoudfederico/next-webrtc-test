import { createContext, useContext, useState } from "react";

export const CameraContext = createContext();

export const useCameraContext = () => useContext(CameraContext);

export const CameraProvider = ({ children }) => {
  const [cameras, setCameras] = useState([]);

  return (
    <CameraContext.Provider value={{ cameras }}>
      {children}
    </CameraContext.Provider>
  );
};
