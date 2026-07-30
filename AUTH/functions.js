import { request } from 'https';

// Funcion para envio de correos 
// usado en:
//          * Post webloginforgot para envio de contraseña olvidada
export  function envio_correo(tipo, code, user) {
        let asunto = ''
        let texto_correo = "<div style='BACKGROUND-COLOR: #f7f7f7'></div><table height='100%' cellspacing='0' cellpadding='0' width='100%' bgcolor='#f7f7f7' border='0'><tbody><tr><td height='100%' valign='top' width='100%' align='center'>  <table cellspacing='0' cellpadding='0' width='100%' align='center' bgcolor='#f7f7f7' border='0'><tbody><tr><TD><TABLE cellSpacing=0 cellPadding=0 style='MAX-WIDTH: 900px' align=center border=0><TBODY><TR><td valign='top' width='100%' align='center'><table style='MAX-WIDTH: 900px' cellspacing='0' cellpadding='0' width='100%' bgcolor='#f7f7f7' border='0'><tbody><tr><td style='PADDING-BOTTOM: 30px; PADDING-TOP: 30px; PADDING-LEFT: 20px; PADDING-RIGHT: 20px' align='center'><div id='logo' class='mktoImg' mktolockimgsize='true'><a href='#' target='_blank'><img style='BORDER-LEFT-WIDTH: 0px; FONT-SIZE: 14px; TEXT-DECORATION: none; MAX-WIDTH: 250px; FONT-FAMILY: Helvetica, Arial, sans-serif; BORDER-RIGHT-WIDTH: 0px; WIDTH: 100%; BORDER-BOTTOM-WIDTH: 0px; FONT-WEIGHT: bold; COLOR: #000000; PADDING-BOTTOM: 0px; PADDING-TOP: 0px; PADDING-LEFT: 0px; DISPLAY: block; PADDING-RIGHT: 0px; BORDER-TOP-WIDTH: 0px' border='0' alt='America-service' src='https:\/\/www.activecapitalreinsurance.com\/Arts\/ACRE_LOGO-01_300px.png' width='300'><\/a> <\/div><\/td><\/tr><\/tbody><\/table><\/td><\/TR><\/TBODY><\/TABLE><\/TD><\/tr><\/tbody><\/table><table cellspacing='0' cellpadding='0' width='100%' align='center' bgcolor='#f7f7f7' border='0'><tbody><tr><TD><TABLE cellSpacing=0 cellPadding=0 style='MAX-WIDTH: 900px' align=center border=0><TBODY><TR><td valign='top' width='100%' align='center'><table style='MAX-WIDTH: 900px' cellspacing='0' cellpadding='0' width='100%' bgcolor='#ffffff' border='0'><tbody><tr><td style='PADDING-BOTTOM: 0px; PADDING-TOP: 20px; PADDING-LEFT: 20px; PADDING-RIGHT: 20px'><div style='PADDING-BOTTOM: 20px'><\/div><table cellspacing='0' cellpadding='0' width='100%' border='0'><tbody><tr><td align='left'><table cellspacing='0' cellpadding='0' width='100%' border='0'><tbody><tr><td style='FONT-SIZE: 14px; BORDER-BOTTOM: #dcdcdc 1px solid; PADDING-BOTTOM: 10px; PADDING-TOP: 0px; PADDING-LEFT: 0px; LINE-HEIGHT: 18px; PADDING-RIGHT: 0px'><span style='FONT-SIZE: 14px; FONT-FAMILY: 'Open Sans', Helvetica, sans-serif; COLOR: #000000; LINE-HEIGHT: 18px'><div id='text1' class='mktoText'><\/div><\/span><\/td><\/tr><\/tbody><\/table><\/td><\/tr><tr>"
        texto_correo += "<td style='FONT-SIZE: 21px; PADDING-BOTTOM: 5px; PADDING-TOP: 15px; PADDING-LEFT: 0px; LINE-HEIGHT: 25px; PADDING-RIGHT: 0px' align='left'><span class='blue' style='FONT-SIZE: 21px; FONT-FAMILY: 'Open Sans', Helvetica, sans-serif; COLOR: #00586f; LINE-HEIGHT: 25px'><div id='text4' class='mktoText'><a style='TEXT-DECORATION: none; FONT-WEIGHT: 400; COLOR: #00586f'><\/a><\/div><\/span><\/td><\/tr><tr><td style='FONT-SIZE: 16px; PADDING-BOTTOM: 20px; PADDING-TOP: 0px; PADDING-LEFT: 0px; LINE-HEIGHT: 20px; PADDING-RIGHT: 0px' align='left'><span style='FONT-SIZE: 16px; FONT-FAMILY: 'Open Sans', Helvetica, sans-serif; COLOR: #000000; LINE-HEIGHT: 20px'><div id='text5' class='mktoText'>"
        if (tipo == 'olvido_contraseña') {
            texto_correo += "Your login account has been reset. Please use the following temporary password to log in to the Active Re Approval Dashboard. For security reasons, as soon as you log in your personal password must be set, thank you!.<\/div><\/span><\/td><\/tr><tr><td style='FONT-SIZE: 21px; PADDING-BOTTOM: 5px; PADDING-TOP: 15px; PADDING-LEFT: 0px; LINE-HEIGHT: 25px; PADDING-RIGHT: 0px' align='left'><span class='blue' style='FONT-SIZE: 21px; FONT-FAMILY: 'Open Sans', Helvetica, sans-serif; COLOR: #00586f; LINE-HEIGHT: 25px'><div id='text4' class='mktoText'><a style='TEXT-DECORATION: none; FONT-WEIGHT: 400; COLOR: #00586f'> <\/a><\/div><\/span><\/td><\/tr><tr><td style='FONT-SIZE: 16px; PADDING-BOTTOM: 20px; PADDING-TOP: 0px; PADDING-LEFT: 0px; LINE-HEIGHT: 20px; PADDING-RIGHT: 0px' align='center'><span style='width: 50%;FONT-SIZE: 16px; FONT-FAMILY: 'Open Sans', Helvetica, sans-serif; COLOR: #000000; LINE-HEIGHT: 20px'>Temporary password:<br><b>" + code + "<\/b>"
            asunto = 'Active Re - Approvals Dashboard'
        }
        texto_correo += "<\/span><\/td><\/tr><\/tbody><\/table><\/td><\/tr><\/tbody><\/table><\/td><\/TR><\/TBODY><\/TABLE><\/TD><\/tr><\/tbody><\/table><table cellspacing='0' cellpadding='0' width='100%' align='center' bgcolor='#f7f7f7' border='0'><tbody><tr><TD><TABLE cellSpacing=0 cellPadding=0 style='MAX-WIDTH: 900px' align=center border=0><TBODY><TR><td style='PADDING-BOTTOM: 10px; PADDING-TOP: 20px; PADDING-LEFT: 0px; PADDING-RIGHT: 0px' valign='top' width='100%' align='left'><table cellspacing='0' cellpadding='0' width='100%' bgcolor='#00586f' border='0'><tbody><tr><td style=\"FONT-SIZE: 12px; PADDING-BOTTOM: 20px; PADDING-TOP: 20px; PADDING-LEFT: 20px; LINE-HEIGHT: 16px; PADDING-RIGHT: 20px; COLOR: white; text-align: justify;\"<span class='white' style=\"FONT-SIZE: 12px; FONT-FAMILY: 'Open Sans', Helvetica, sans-serif; COLOR: white; LINE-HEIGHT: 14px; text-align: justify;\">Este mensaje se dirige exclusivamente a su destinatario. "
        texto_correo += "Contiene informacion CONFIDENCIAL sometida a secreto profesional o cuya divulgacion esta prohibida por la ley. Si ha recibido este mensaje por error, debe saber que su lectura, copia y uso estan prohibidos. Le rogamos que nos lo comunique inmediatamente por esta misma via o por telefono y proceda a su destruccion."
        texto_correo += "<br>This message is addressed exclusively to its recipient. It contains CONFIDENTIAL information subject to professional secrecy or whose disclosure is prohibited by law. If you have received this message in error, you should know that its reading, copying and use are prohibited. We request that you communicate it to us immediately by this same route or by telephone and proceed to its destruction.<\/span><\/td><\/tr><\/tbody><\/table><\/td><\/TR><\/TBODY><\/TABLE><\/TD><\/tr><\/tbody><\/table><\/div>"
            // texto_correo = texto_correo.replace(/(?:\r\n|\r|\n)/g, '');
        var correo = JSON.stringify({
            'to': user,
            'cc': '',
            'asunto': asunto,
            'body': texto_correo
        })
        var options = {
            hostname: 'ade577a92a8d4f93aace1d374e2500.22.environment.api.powerplatform.com',
            port: 443,
            path: '/powerautomate/automations/direct/workflows/4b4a58facf5f4c2ca2a89c2677823529/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=KyGhr99X-X6vKssXjyjvyT1ulXADlPFURIack2PNZhA',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': correo.length
            }
        };
        var req = request(options, (res) => {
            // console.log('statusCode:', res.statusCode);
            // console.log('headers:', res.headers);

            res.on('data', (d) => {
                process.stdout.write(d);
            });
        });
        req.on('error', (e) => {
            // console.error(e);
        });

        req.write(correo);
        req.end();
        // return req.statusCode
    }