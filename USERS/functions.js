// Función para calcular las estadísticas de los departamentos
export function calculateDepartments(logRecords, modules) {
    let claims = 0;
    let contabilidad = 0;
    let Governance = 0;
    let finance = 0;
    let underwriting = 0;
    let RRHH = 0;

    // Iterar a través de todos los registros de log
    for (let i = 0; i < logRecords.length; i++) {
        for (let x in logRecords[i]) {
            // Contar las ocurrencias por departamento
            if (logRecords[i][x] === "Claims" || logRecords[i][x] === "Siniestros") {
                claims++;
            }
            if (logRecords[i][x] === "Accounting") {
                contabilidad++;
            }
            if (logRecords[i][x] === "Corporate, Governance & Human Resources") {
                Governance++;
            }
            if (logRecords[i][x] === "Finance") {
                finance++;
            }
            if (logRecords[i][x] === "Underwriting") {
                underwriting++;
            }
            if (logRecords[i][x] === "RRHH") {
                RRHH++;
            }
        }
    }

    // Total de registros procesados
    const totalDepartments = claims + contabilidad + Governance + finance + underwriting + RRHH;

    let departments = [];

    // Si el usuario tiene acceso a todos los módulos, mostrar todos los departamentos
    if (modules === "All") {
        departments.push(
            ["Claims", Math.round((claims * 100) / totalDepartments), claims, "#6610f2;"],
            ["Accounting", Math.round((contabilidad * 100) / totalDepartments), contabilidad, "#212529;"],
            ["Governance", Math.round((Governance * 100) / totalDepartments), Governance, "#ffc107;"],
            ["Finance", Math.round((finance * 100) / totalDepartments), finance, "#198754;"],
            ["Underwriting", Math.round((underwriting * 100) / totalDepartments), underwriting, "#dc3545;"]
        );
    } else {
        // Si no tiene acceso a todos los módulos, solo agregar los departamentos accesibles
        if (modules.includes("Accounting")) {
            departments.push(["Accounting", Math.round((contabilidad * 100) / totalDepartments), contabilidad, "#212529;"]);
        }
        if (modules.includes("Claims")) {
            departments.push(["Claims", Math.round((claims * 100) / totalDepartments), claims, "#6610f2;"]);
        }
        if (modules.includes("Governance")) {
            departments.push(["Governance", Math.round((Governance * 100) / totalDepartments), Governance, "#ffc107;"]);
        }
        if (modules.includes("Finance")) {
            departments.push(["Finance", Math.round((finance * 100) / totalDepartments), finance, "#198754;"]);
        }
        if (modules.includes("Underwriting")) {
            departments.push(["Underwriting", Math.round((underwriting * 100) / totalDepartments), underwriting, "#dc3545;"]);
        }
    }

    return departments;
}

export function calculateLogStats(logQuery) {
    let UserTotalEjecutando = 0;
    let UserTotalRechazado = 0;
    let UserTotal = 0;
    let UserTotalPending = 0;

    for (let i = 0; i < logQuery.rowsAffected; i++) {
        const log = logQuery.recordset[i];

        // Procesar los diferentes estados
        if (log.estado === "Verify" || log.estado === "Approve" || log.estado === "Signature" ||
            log.estado === "Apply" || log.estado === "Execute") {
            UserTotalPending++;
            UserTotalEjecutando++;
        } else if (log.estado === "Rejected") {
            UserTotalRechazado++;
        } else if (log.estado === "Signed" || log.estado === "Applied" || log.estado === "Executed") {
            UserTotal++;
        }
    }

    return { UserTotal, UserTotalEjecutando, UserTotalPending, UserTotalRechazado };
}
function checkIntegrantsAndCountDuplicates(integrants, initialQuantity) {
    const counts = {};

    integrants.forEach(integrant => {
        if(integrant === "N/A" || integrant === null || integrant === undefined || integrant === "") {
            return;
        }
        counts[integrant] = (counts[integrant] || 0) + 1;
    });

    for (const key in counts) {
        if (counts[key] > 1) {
            initialQuantity += counts[key] - 1;
        }
    }

    return initialQuantity;
}
export async function validateQuantity(quantity, solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor) {
    let quantityValid = 0;
    const integrants = [solicitante, verificador, aprobador, firmante, operador, ejecutor, asignado, csuscriptor];
    let initialQuantity = checkIntegrantsAndCountDuplicates(integrants, quantity);
    for (let i = 0; i < integrants.length; i++) {
        if (integrants[i] !== "N/A" && integrants[i] !== null && integrants[i] !== undefined && integrants[i] !== "") {
            quantityValid++;
        }
    }
    if (quantityValid !== initialQuantity) {
        throw {
            status: 400,
            message:"One or more child members are not found, indicating the team is incorrectly created."
    }
}
}

