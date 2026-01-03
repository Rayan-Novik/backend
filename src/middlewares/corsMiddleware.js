import cors from "cors";

const allowedOrigins = [
  "https://ecommercerpool.shop",
  "https://admin.ecommercerpool.shop",
  "https://back.ecommercerpool.shop",
  "http://localhost:3000",
  "https://manateechat.shop/",
  "https://admin.manateechat.shop",
  "https://back.manateechat.shop",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "http://192.168.100.14:3000",
  "http://192.168.100.14:3001",
];

const corsMiddleware = cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // permite requests sem origin (Postman, curl)
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // permite cookies se precisar
});

export default corsMiddleware;
