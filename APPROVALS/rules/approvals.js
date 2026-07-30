export default class approvalsRule {

    static async checkIntegrant(user) {
        return ["manager", "area_supervisor", "rrhh_supervisor", "acc_supervisor"].includes(user);
    }

    static async chekIntegrant(user) {
        return approvalsRule.checkIntegrant(user);
    }

    static async checkIntegrantSIR(user) {
        return ["manager", "area_supervisor", "rrhh_supervisor", "acc_supervisor", "csuscriptor"].includes(user);
    }

    static async chekIntegrantSIR(user) {
        return approvalsRule.checkIntegrantSIR(user);
    }
    static async getIntegrantUser(approvalFlow, manager, departments) {
        // roles that we need to check in the approval flow
        const allIntegrants = ["uverificador", "uaprobador", "ufirmante", "uoperador", "uejecutor", "uverificador_suplente",
            "uaprobador_suplente", "ufirmante_suplente", "uoperador_suplente", "uejecutor_suplente"];

        const status = [{ integrante:"uverificador", status:"Verify"},{ integrante:"uaprobador", status:"Approve"},
            { integrante:"ufirmante", status:"Signature"},  { integrante:"uoperador", status:"Operate"},
            { integrante:"uejecutor", status:"Execute"}]

        let integrants = {};
        // Loop through the roles and check the approval flow for each
        for (let index = 0; index < allIntegrants.length; index++) {
            const role = allIntegrants[index];
            const user = approvalFlow[role];
            const isARole = await approvalsRule.checkIntegrant(user)

            if (!isARole) {
                integrants[role] = user;
            } else {
                if (user === "manager") {
                    integrants[role] = manager;

                } else if (user === "area_supervisor") {
                    const flowDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento));
                    if (flowDept) integrants[role] = flowDept.manager;
                } else if (user === "rrhh_supervisor") {
                    const rrhhDept = departments.find(dept => dept.nombre === "RRHH");
                    if (rrhhDept) integrants[role] = rrhhDept.manager;
                } else if (user === "acc_supervisor") {
                    const accountingDept = departments.find(dept => dept.nombre === "Accounting" && dept.ccompania === Number(approvalFlow.ccompania));
                    if (accountingDept) integrants[role] = accountingDept.manager;
                }
            }
        }
        let seen = new Set();
        let repeatedValues = new Set();
        // logict to not repeat the same user in the list
        Object.keys(integrants).forEach(key => {
            let value = integrants[key];

            if (seen.has(value) && value !== 'N/A') {
                repeatedValues.add(value);
            } else {
                seen.add(value);
            }
        });

        Object.keys(integrants).forEach(key => {
            let value = integrants[key];

            if (repeatedValues.has(value) && value !== 'N/A') {
                integrants[key] = 'N/A'; 
                repeatedValues.delete(value); 
            }
        });
        
        // logic to get the first valid user status
        let validIntegrants = Object.keys(integrants).filter(key => integrants[key] !== 'N/A' && integrants[key] !== null);
        let firstValidIntegrant = validIntegrants[0];
        let correspondingStatus = status.find(s => s.integrante === firstValidIntegrant);
        let firstStatus;
        if (correspondingStatus) {
            firstStatus = correspondingStatus.status;
        }
        return {integrants: integrants, status: firstStatus}

    }
    static async getIntegrantUserSIR(approvalFlow, manager, departments, csuscriptor) {
        // roles that we need to check in the approval flow
        const allIntegrants = ["uverificador", "uaprobador", "ufirmante", "uoperador", "uejecutor", "uverificador_suplente",
            "uaprobador_suplente", "ufirmante_suplente", "uoperador_suplente", "uejecutor_suplente"];

        const status = [{ integrante:"uverificador", status:"Verify"},{ integrante:"uaprobador", status:"Approve"},
            { integrante:"ufirmante", status:"Signature"},  { integrante:"uoperador", status:"Operate"},
            { integrante:"uejecutor", status:"Execute"}]

        let integrants = {};
        // Loop through the roles and check the approval flow for each
        for (let index = 0; index < allIntegrants.length; index++) {
            const role = allIntegrants[index];
            const user = approvalFlow[role];
            const isARole = await approvalsRule.checkIntegrantSIR(user)

            if (!isARole) {
                integrants[role] = user;
            } else {
                if (user === "manager") {
                    integrants[role] = manager;

                } else if (user === "area_supervisor") {
                    const flowDept = departments.find(dept => dept.id === Number(approvalFlow.cdepartamento));
                    if (flowDept) integrants[role] = flowDept.manager;
                } else if (user === "rrhh_supervisor") {
                    const rrhhDept = departments.find(dept => dept.nombre === "RRHH");
                    if (rrhhDept) integrants[role] = rrhhDept.manager;
                } else if (user === "acc_supervisor") {
                    const accountingDept = departments.find(dept => dept.nombre === "Accounting" && dept.ccompania === Number(approvalFlow.ccompania));
                    if (accountingDept) integrants[role] = accountingDept.manager;
                }
                else if (user === "csuscriptor") {
                    integrants[role] = csuscriptor;
                }
            }
        }
        let seen = new Set();
        let repeatedValues = new Set();
        // logict to not repeat the same user in the list
        Object.keys(integrants).forEach(key => {
            let value = integrants[key];

            if (seen.has(value) && value !== 'N/A') {
                repeatedValues.add(value);
            } else {
                seen.add(value);
            }
        });

        Object.keys(integrants).forEach(key => {
            let value = integrants[key];

            if (repeatedValues.has(value) && value !== 'N/A') {
                integrants[key] = 'N/A'; 
                repeatedValues.delete(value); 
            }
        });
        
        // logic to get the first valid user status
        let validIntegrants = Object.keys(integrants).filter(key => integrants[key] !== 'N/A' && integrants[key] !== null);
        let firstValidIntegrant = validIntegrants[0];
        let correspondingStatus = status.find(s => s.integrante === firstValidIntegrant);
        let firstStatus;
        if (correspondingStatus) {
            firstStatus = correspondingStatus.status;
        }
        return {integrants: integrants, status: firstStatus}

    }
}
