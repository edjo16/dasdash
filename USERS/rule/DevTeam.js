import e from "cors";
import sql from "mssql";
import USERModel from "../model/USER.js";
import { validateQuantity } from "../functions.js";

export default class DevTeam {
    static async validateTeam(iddevteam, UserID) {
        const validMembers = ['lossa', 'dgutierrez', 'epinto'];
        return validMembers.includes(iddevteam) || validMembers.includes(UserID);
    }

    static async validateITModuleTemporaryLocation(iddevteam, UserID) {
        const validMembers = ['lossa', 'dgutierrez', 'epinto', 'abarahona','npalacios', 'r.martinez'];
        return validMembers.includes(iddevteam) || validMembers.includes(UserID);
    }
    static async validateMarketingModule(iddevteam, UserID) {
        const validMembers = ['lossa', 'dgutierrez', 'epinto', 'carosarena','edossantos', 'r.martinez'];
        return validMembers.includes(iddevteam) || validMembers.includes(UserID);
    }
    static async validateChangeRequestModule(iddevteam, UserID) {
        const validMembers = ['lossa', 'dgutierrez', 'epinto', 'rparra','jpatino', 'r.martinez'];
        return validMembers.includes(iddevteam) || validMembers.includes(UserID);
    }
    static async validateSupportView(transaction, id, UserName, iddevteam) {
        const {solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor} =  await USERModel.getUsernamesForApproval(transaction, id);
        const  result =  await USERModel.getUserIDForApproval(transaction, solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor);
        let validMembers = ['lossa', 'dgutierrez', 'epinto', 'r.martinez'].concat(result);
        const requester = await USERModel.obtenerDatosUsuario(transaction, solicitante);
        validMembers = requester.Manager ? validMembers.concat(requester.Manager) : validMembers;
        return validMembers.includes(iddevteam) || validMembers.includes(UserName);
    }
    
    static async validateSupportViewApproval(transaction, id, UserName, iddevteam, ejecutorPrimario ) {
        const {solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor} =  await USERModel.getUsernamesForApproval(transaction, id);
        const  result =  await USERModel.getUserIDForApproval(transaction, solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor);
        const ejecutorName = await USERModel.obtenerDatosUsuarioByName(transaction, ejecutorPrimario) || '';
        let validMembers = ['lossa', 'dgutierrez', 'epinto', 'r.martinez', ejecutorName.UserID ].concat(result);
        const requester = await USERModel.obtenerDatosUsuarioByName(transaction, solicitante);
        validMembers = requester.Manager ? validMembers.concat(requester.Manager) : validMembers;
        return validMembers.includes(iddevteam) || validMembers.includes(UserName);
    }

    static async validatePermissionApproval(transaction, id, UserName, manager, areaSupervisor, iddevteam, hasChild, childId, cflow) {
        try {
        const {solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor} =  await USERModel.getUsernamesForApproval(transaction, id);
        const accessApprovals = await USERModel.getAccessUsers(transaction, cflow);
        const  result =  await USERModel.getUserIDForApproval(transaction, solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor);
        const validateCount = await validateQuantity(result.length, solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor ); 
        let  userAlias = await USERModel.getUserAlias(transaction, UserName) || null;
        let validMembers = result.concat(accessApprovals)
        userAlias && validMembers.push(userAlias.user_alias)
        areaSupervisor && areaSupervisor.manager !== 'N/A' && validMembers.push(areaSupervisor.manager)
        areaSupervisor && areaSupervisor.suplente !== 'N/A' && validMembers.push(areaSupervisor.suplente)
        const childs = hasChild && await USERModel.getUsernamesForApproval(transaction, childId);
        const resultChild = hasChild && await USERModel.getUserIDForApproval(transaction, childs.solicitante, childs.verificador, childs.aprobador, childs.firmante, childs.operador, childs.ejecutor, childs.asignado, childs.csuscriptor, manager);
        const requester = await USERModel.obtenerDatosUsuario(transaction, solicitante);
        if (!requester) {
            throw error;
        }
        validMembers = resultChild.length > 0 ? validMembers.concat(resultChild) : validMembers;
        validMembers = requester.Manager? validMembers.concat(requester.Manager) : validMembers;
        return validMembers.includes(iddevteam) || validMembers.includes(UserName);
    } catch (error) {
        console.error("Error validating permission approval:", error);
        throw {
            status: 400,
            message: "One of the integrants is not found, indicating the team is incorrectly created."
        };    }

    }
    static async validatePermissionCancelApproval(transaction, id,  UserID, UserName, areaSupervisor, iddevteam) {
        try {
            const {solicitante} =  await USERModel.getUsernamesForApproval(transaction, id);
            if (UserName === solicitante) return true;
            if (
                (areaSupervisor && areaSupervisor.manager !== 'N/A' && UserID === areaSupervisor.manager) ||
                (areaSupervisor && areaSupervisor.suplente !== 'N/A' && UserID === areaSupervisor.suplente)
            ) {
                return true;
            }
            if (UserID === iddevteam) return true;
            return false;
        } catch (error) {
            console.error("Error validating permission approval:", error);
            throw {
                status: 400,
                message: "One of the integrants is not found, indicating the team is incorrectly created."
            };
        }
    }
}

