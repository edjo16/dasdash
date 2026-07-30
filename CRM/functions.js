    export const groupBy = (allTasks, users) => {
    const grouped = {};
    allTasks.forEach(task => {
        const { uasignado, cprioridad } = task;
        const userInfo = users.find(user => user.UserID === uasignado) || {};
  
      if (!grouped[uasignado]) {
        grouped[uasignado] = {
          name: userInfo.Name || uasignado,
          email: userInfo.Email || '',
          critical: [],
          important: [],
          normal: [],
        };
      }
  
      if (cprioridad === 2) {
        grouped[uasignado].critical.push(task);
      } else if (cprioridad === 1) {
        grouped[uasignado].important.push(task);
      } else if (cprioridad === 0) {
        grouped[uasignado].normal.push(task);
      }
    });
  
    return grouped;
    };

    export const prepareEmail = (groupTasks) => {
      let emailData = [];
      const maxTasksPerEmail = 4;
      const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const truncate = (value, size) => {
        const text = String(value || '').trim();
        return text.length > size ? `${text.slice(0, size)}...` : text;
      };

      const formatDate = (value) => {
        if (!value) return 'No date';
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return 'No date';
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyyy = dt.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      };

      const priorities = {
        critical: { label: 'Critical', color: '#DC3545' },
        important: { label: 'Important', color: '#FF4400' },
        normal: { label: 'Normal', color: '#FFCA1C' }
      };

      Object.keys(groupTasks).forEach((username) => {
        const person = groupTasks[username] || {};
        const name = person.name || 'User';
        const email = person.email || '';
        const critical = Array.isArray(person.critical) ? person.critical : [];
        const important = Array.isArray(person.important) ? person.important : [];
        const normal = Array.isArray(person.normal) ? person.normal : [];
        const totalTasks = critical.length + important.length + normal.length;
        if (!email || totalTasks === 0) {
          return;
        }

        const selected = [];
        const appendTasks = (tasks, priority) => {
          const available = maxTasksPerEmail - selected.length;
          if (available <= 0 || !tasks.length) return;
          const subset = tasks.slice(-available);
          subset.forEach((task) => selected.push({ task, priority }));
        };

        appendTasks(critical, 'critical');
        appendTasks(important, 'important');
        appendTasks(normal, 'normal');

        const rows = selected.map(({ task, priority }) => {
          const meta = priorities[priority] || priorities.normal;
          const subject = escapeHtml(truncate(task?.asunto_interno || '', 120));
          const title = escapeHtml(truncate(task?.conversacion_titulo || '', 180));
          const dueDate = escapeHtml(formatDate(task?.ffin));
          const taskId = escapeHtml(task?.id || '');

          return (
            '<tr>' +
              '<td style="padding:0 0 12px 0;">' +
                '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #d9d9d9; border-collapse:collapse;">' +
                  '<tr>' +
                    '<td style="padding:10px 12px; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#5f5f5f;">ID: ' + taskId + '</td>' +
                    '<td align="right" style="padding:10px 12px;">' +
                      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">' +
                        '<tr><td bgcolor="' + meta.color + '" style="padding:4px 8px; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#000000;">' + escapeHtml(meta.label) + '</td></tr>' +
                      '</table>' +
                    '</td>' +
                  '</tr>' +
                  '<tr><td colspan="2" style="padding:0 12px 10px 12px; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#333333;"><strong>📝Subject:</strong> ' + subject + '</td></tr>' +
                  '<tr><td colspan="2" style="padding:0 12px 10px 12px; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#333333;"><strong>📅Due date:</strong> ' + dueDate + '</td></tr>' +
                  '<tr><td colspan="2" style="padding:0 12px 12px 12px; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#111111;">' + title + '</td></tr>' +
                '</table>' +
              '</td>' +
            '</tr>'
          );
        }).join('');

        const firstName = escapeHtml(String(name).split(' ')[0] || name);
        const toDesigned = process.env.ENTORNO == 'desa' ? 'epinto@acreinsurance.com' : email;

        emailData.push({
          to: toDesigned,
          cc: '',
          cco: '',
          from: 'no-reply@acreinsurance.com',
          subject: 'Pending Tasks CRM',
          body:
            '<!DOCTYPE html>' +
            '<html lang="en"><head><meta charset="UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM Pending Tasks</title></head>' +
            '<body style="margin:0;padding:0;background-color:#f2f2f2;">' +
              '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f2f2f2;mso-table-lspace:0pt;mso-table-rspace:0pt;">' +
                '<tr><td align="center" style="padding:24px 12px;">' +
                  '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="width:640px;max-width:640px;background-color:#ffffff;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">' +
                    '<tr><td style="padding:24px 24px 16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;color:#222222;"><strong>Hello, ' + firstName + '.</strong> You have ' + totalTasks + ' pending task' + (totalTasks > 1 ? 's' : '') + '.</td></tr>' +
                    '<tr><td style="padding:0 24px 8px 24px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="border-top:1px solid #e5e5e5;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>' +
                    '<tr><td style="padding:8px 24px 8px 24px;">' +
                      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">' + rows + '</table>' +
                    '</td></tr>' +
                    '<tr><td style="padding:12px 24px 24px 24px;">' +
                      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">' +
                        '<tr><td bgcolor="#00586F" style="padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;"><a href="sir://ActiveDashboard|/" style="color:#ffffff;text-decoration:none;">Open Dashboard</a></td></tr>' +
                      '</table>' +
                    '</td></tr>' +
                  '</table>' +
                '</td></tr>' +
              '</table>' +
            '</body></html>',
          enddate: new Date().toISOString(),
          cuser: name,
          sent: false
        });
      });

      return emailData;
    };

    export const prepareEmailForPending =  async (groupTasks, name, email) => {
      let emailData = [];
      try{ 
        const baseUrl = process.env.CRM_POST;
        if (!baseUrl) throw new Error('CRM_POST is not defined in environment variables');
          const priority = groupTasks.cprioridad === 2 ? 'critical' : groupTasks.cprioridad === 1 ? 'important' : 'normal';
          // Generate the HTML content for the email
          let emailHtml = '';
  
          let personHtml = `<div style="margin-bottom: 20px;background-color:white;"><h4 style="color: #333;background-color:white;word-break:break-word;overflow-wrap:break-word">You have been assigned to a task</h4>`;

          const generateTaskHtml = (task, priority) => {
              let taskHtml = '';
                  const { conversacion_titulo, asunto_interno, ffin, id } = task;
                  let dueDate = 'No date';
                  if (ffin) {
                      const dt = new Date(ffin);
                      const dd = String(dt.getDate()).padStart(2, '0');
                      const mm = String(dt.getMonth() + 1).padStart(2, '0');
                      const yyyy = dt.getFullYear();
                      dueDate = `${dd}/${mm}/${yyyy}`;
                  }
                  let priorityColor = '';
  
                  if (priority === 'critical') priorityColor = '#DC3545'; 
                  if (priority === 'important') priorityColor = '#FF4400'; 
                  if (priority === 'normal') priorityColor = '#FFCA1C';  
  
                  taskHtml += `<div style="padding: 5px; border: 1px solid #ddd; border-radius: 5px; margin: 4px;background-color:white;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; margin: 0 0 4px 0;"><tr><td style="font-size: 12px; color: #5f5f5f;">ID: ${id}</td><td width="6">&nbsp;</td><td style="font-size: 12px; color: #5f5f5f;">Priority: </td><td width="6">&nbsp;</td><td bgcolor="${priorityColor}"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-size: 10px; color: #000000ff; padding: 5px 8px; text-align: center;">${priority.charAt(0).toUpperCase() + priority.slice(1)}</td></tr></table></td></tr></table><div style="margin-left: 40px; font-size: 14px; color: #5f5f5f;"><p style="margin: 0 0 8px 0; mso-line-height-rule: exactly;">📝 Subject: ${asunto_interno}</p><p style="margin: 0 0 8px 0; mso-line-height-rule: exactly;">📅 Due Date: ${dueDate}</p><p style="color: #000000; margin: 0 0 8px 0; mso-line-height-rule: exactly;">${conversacion_titulo.length > 100  ? conversacion_titulo.slice(0, 100) + '...' : conversacion_titulo}</p></div></div>`;
              
              return taskHtml;
          };
  
          personHtml += generateTaskHtml(groupTasks, priority);

          personHtml += '</div>';
          emailHtml += personHtml;
          const toDesigned = process.env.ENTORNO == 'desa'? 'epinto@acreinsurance.com' : email; 
          const payload = {
            to: toDesigned || '',
            cc:"",
            cco:"",
            subject: `CRM [${groupTasks.id}] - CRM task has been assigned to you` || '',
            body: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>CRM</title></head><body style="Margin:0;padding:0;background:#f2f2f2;"><center style="width:100%;table-layout:fixed;background:#f2f2f2;padding:24px 0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f2f2f2;"><tr><td align="center" style="padding:0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td height="25" style="line-height:25px;font-size:0;">&nbsp;</td></tr></table><!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td height="50" style="line-height:50px;font-size:0;">&nbsp;</td></tr></table><![endif]--><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:8px;"><tr><td style="padding:24px 28px;font-family:Arial,sans-serif;font-size:16px;line-height:22px;color:#333333;"><h2 style="Margin:0 0 16px 0;font-size:20px;font-weight:600;color:#222222;word-break:break-word;overflow-wrap:break-word">Hello, ${name}. You have been assigned to a task.</h2><div style="border-top:1px solid #e5e5e5;Margin:0 0 16px 0;padding-top:16px;">${emailHtml}</div><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="left" bgcolor="#00586F"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-size:14px;color:#ffffff;padding:8px 16px;text-align:center;"><a href="sir://ActiveDashboard|/" style="color:#ffffff; text-decoration:none; display:inline-block;">Open Dashboard</a></td></tr></table></td></tr></table></td></tr></table></td></tr></table></center></body></html>`,
        };
          // Create the email structure for the user
        const url = `${baseUrl.replace(/\/$/, '')}/api/global/v1/send_mail`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeout);

        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await res.json().catch(() => null)
            : await res.text().catch(() => null);
        if (!res.ok) {
            return { ok: false, status: res.status, error: data || { message: res.statusText } };
        }

        return { ok: true, status: res.status, data, body: JSON.stringify(payload) };
    } catch (error) {
        const status = error.name === 'AbortError' ? 408 : 500;
        console.error('postCRM error:', status, error?.message || error);
        return { ok: false, status, error: { message: error?.message || 'Request failed' } };
    }
  }
    export function buildEmailList(asignados, defaultDomain = 'acreinsurance.com') {
      if (!Array.isArray(asignados) || asignados.length === 0) return '';
      const emails = asignados
        .map(item => typeof item === 'string' ? item : (item && item.code))
        .filter(Boolean)
        .map(code => code.includes('@') ? code : `${code}@${defaultDomain}`)
        .map(e => e.trim().toLowerCase());
      return Array.from(new Set(emails)).join(';');
    }

    export async function sir_post_validation(modulo, input) {
    const baseUrl = process.env.CRM_POST;
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/dashboard/v1/sir-references`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({reference:modulo,value:input}),
        });
        const data = await res.json()
        if (data.success === true) {
            return true
        }
        else{
            return false
        }
}

export async function cas_post_validation(modulo, input) {
    const baseUrl = process.env.CRM_POST;
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/dashboard/v1/cas-references`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({reference:modulo,value:input}),
        });
        const data = await res.json()
        if (data.success === true) {
            return true
        }
        else{
            return false
        }
}
