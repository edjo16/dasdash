import { spawn } from 'child_process';
import sql from 'mssql';
export default class SIRModel {
    constructor() { }

    static async customReport(req, res)  {
        var reporte = req.body.reporte
        var dataToSend;
        // spawn new child process to call the python script
        if (reporte == "ReporteTrimestraSlip") {
            var inicio = req.body.inicio;
            var fin = req.body.fin;
            const python = spawn("python", [
                "C:/Carpetas compartidas/Tools/Reporte Trimestral/run.py",
                inicio,
                fin,
            ]);
            python.stdout.on("data", function (data) {
                dataToSend = data.toString();
            });
            python.on("close", (code) => {
                res.status(200).send({ reporte: reporte });
            });
        } else if (reporte == "ReporteTrimestraContratos") {
            var inicio = req.body.inicio;
            var fin = req.body.fin;
            const python = spawn("python", [
                "C:/Carpetas compartidas/Tools/Reporte Trimestral/run_contratos.py",
                inicio,
                fin,
            ]);
            python.stdout.on("data", function (data) {
                dataToSend = data.toString();
            });
            python.on("close", (code) => {
                res.status(200).send({ reporte: reporte });
            });
        } else if (reporte == "Pipeline") {
            const python = spawn("python", [
                "C:/Carpetas compartidas/Tools/Reportes Underwriting/Pipeline.py",
            ]);
            python.stdout.on("data", function (data) {
                dataToSend = data.toString();
            });
            python.on("close", (code) => {
                res.status(200).send({ reporte: reporte });
            });
        } else if (reporte == "Ofertas") {
            const python = spawn("python", [
                "C:/Carpetas compartidas/Tools/Reportes Underwriting/Ofertas.py",
            ]);
            python.stdout.on("data", function (data) {
                dataToSend = data.toString();
            });
            python.on("close", (code) => {
                res.status(200).send({ reporte: reporte });
            });
        } else if (reporte == "notas-msg") {
            var inicio = req.body.inicio;
            var fin = req.body.fin;
            const python = spawn("python", [
                "C:/Carpetas compartidas/Tools/Reporte de auditoria (MSG).py",
                inicio,
                fin,
            ]);
            python.stdout.on("data", function (data) {
                dataToSend = data.toString();
            });
            python.on("close", (code) => {
                res.status(200).send({ reporte: reporte });
            });
        } else {
            res.status(400).send("Repote invalido ");
        }
    }
    static async mgaBordereau(req, res)  {
        var ruta = req.body.ruta;
        var suscriptor = req.body.suscriptor;
        var env = req.body.env;
        var dataToSend;           
        // spawn new child process to call the python script
        const python = spawn("python", [
            "C:/Carpetas compartidas/Tools/MGA_Bordereau/run.py",
            ruta,
            suscriptor,
            env,
        ]);
        python.stdout.on("data", function (data) {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
        python.on("close", (code) => {
            // console.log(python)
            // res.status(200).send({ python: python })
        });
    }   
    static async mgaBordereauEndorsement(req, res)  {
        var ruta = req.body.ruta;
        var suscriptor = req.body.suscriptor;
        var env = req.body.env;
        var dataToSend;
        console.log("mga_bordereau_endorsement", ruta, suscriptor, env);
        // spawn new child process to call the python script
        const python = spawn("python", [
            "C:/Carpetas compartidas/Tools/MGA_Bordereau/run endoso.py",
            ruta,
            suscriptor,
            env,
        ]);
        python.stdout.on("data", function (data) {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
        python.on("close", (code) => {
            // console.log(python)
            // res.status(200).send({ python: python })
        });
    }
    static async liqPayment(req, res)  {
        var ruta = req.body.ruta;
        var suscriptor = req.body.cusuario;
        var env = req.body.env;
        var dataToSend;
        console.log("liquidaciones", ruta, suscriptor, env);
        // spawn new child process to call the python script
        const python = spawn("python", [
            "C:/Carpetas compartidas/Tools/Liquidaciones/payment.py",
            ruta,
            suscriptor,
            env,
        ]);
        python.stdout.on("data", function (data) {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
        python.on("close", (code) => {
            // console.log(python)
            // res.status(200).send({ python: python })
        });
    }   
    static async cobranza(req, res)  {
        var dataToSend;
        // spawn new child process to call the python script
        const python = spawn("python", [
            "C:/Carpetas compartidas/Tools/cobranza/run.py",
        ]);
        python.stdout.on("data", function (data) {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
        python.on("close", (code) => {
            return res.status(200).send("OK");
        });
    }   
    static async sendMail(req, res)  {
        var id = req.body.id;
        var env = req.body.env;
        var dataToSend;
        console.log("sendmail", id, env);
        // spawn new child process to call the python script
        const python = spawn("python", [
            "C:/Carpetas compartidas/Tools/Send_Email/run.py",
            id,
            env,
        ]);
        python.stdout.on("data", function (data) {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
        python.on("close", (code) => {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
    }   
    static async apiGetMonedas(req, res)  {
                new sql.Request().query(
                    "SELECT * FROM sir_mmone order by xnombre_moneda_ingles",
                    (err, result) => {
                        res.status(200).send({ result: result });
                    }
                );
    }

    static async sendMailDashboard(req, res)  {
        var id = req.body.id;
        var env = req.body.env;
        var dataToSend;
        console.log("sendmail", id, env);
        // spawn new child process to call the python script
        //
        const python = spawn("python", [
            "C:/Carpetas compartidas/Tools/Send_Email/Dashboard.py",
            id,
            env,
        ]);
        python.stdout.on("data", function (data) {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
        python.on("close", (code) => {
            dataToSend = data.toString();
            res.status(200).send({ result: dataToSend });
        });
    } 
}