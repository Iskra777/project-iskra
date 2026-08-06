import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next dev-сервер за замовчуванням блокує JS-чанки з "чужого" origin
  // (захист від DNS rebinding) — без цього доступ через LAN IP замість
  // localhost вантажить HTML, але не підключає JS: форми роблять нативний
  // сабміт (повне перезавантаження сторінки) замість обробки через React.
  allowedDevOrigins: ["192.168.1.217"],
};

export default nextConfig;
