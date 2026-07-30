import swaggerJSDoc from "swagger-jsdoc";
import { serve, setup } from "swagger-ui-express";

const options = {
  swaggerDefinition: {
    openapi: "3.0.0", 
    info: {
      title: "Dashboard API Documentation", 
      description: "API Documentation for the Dashboard",
      version: "1.0.0" 
    }
  },
  apis: [
    "./APPROVALS/routes/approvals-routes.js",
    "./SIR/routes/sir-routes.js",
    "./HR/routes/hr-routes.js",
    "./IT/routes/it-routes.js",
    "./mercadeo/routes/badaco-routes.js",
    "./CRM/routes/crm-routes.js"
  ],
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Dashboard API Documentation",
  customfavIcon: "./favicon.ico"  
};

const swaggerSpec = swaggerJSDoc(options);

export const swaggerDocs = (app, port) => {
  const isProduction = process.env.DB_SERVER === "vps-file01";
  
  if (!isProduction) {
    app.use("/api/v1/docs", serve, setup(swaggerSpec, options));
    app.get("/api/v1/docs.json", (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.send(swaggerSpec);
    });
    
    console.log(
      `Version 1 Docs are available on http://${process.env.DB_SERVER || "localhost"}:${port}/api/v1/docs`
    );
  } else {
    console.log("Swagger is disabled in production.");
  }
};
