import { request as _request } from 'https';
import sql from 'mssql';
import {optionsMaster} from '../APPROVALS/functions.js';
export const azurePost = async (RowID) => {
const data = JSON.stringify({ id: Number(RowID), env: process.env.ENTORNO });
const options = optionsMaster(data)

const ApprovalSummit = _request(options, (response) => {
    response.on('data', d => process.stdout.write(d));
});

ApprovalSummit.on('error', (error) => {
    console.error(error);
    const errReq = new sql.Request();
    errReq.input('respuesta', sql.NVarChar, error.message);
    errReq.query("INSERT INTO actcarpeta (cusuario, tipo, respuesta) VALUES (988, 'POST Detalle', @respuesta)").catch(console.error);
});

ApprovalSummit.write(data);
ApprovalSummit.end();
}
export const convertToDate = (dateString) => {
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`
}
export const convertToNewDate = (dateString) => {
    const [day, month, year] = dateString.split('/');
    return new Date(year, month - 1, day); // month es 0-based
};