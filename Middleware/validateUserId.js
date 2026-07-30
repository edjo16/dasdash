export const validateUserId = (req, res, next) => {
     if (!req.session || !req.session.userID) return res.redirect("/weblogin");

    next();
}

export const getAdjustedDate = () => { 
    var newDate = new Date();
    const offset = newDate.getTimezoneOffset();
    newDate = new Date(newDate.getTime() - (offset * 60 * 1000));
    return newDate
}
export const getAdjustedDateMultiple = (lang = 'ENG') => { 
    const newDate = new Date();
    const offset = newDate.getTimezoneOffset();
    const adjustedDate = new Date(newDate.getTime() - (offset * 60 * 1000));
    
    const day = String(adjustedDate.getDate()).padStart(2, '0');
    const year = adjustedDate.getFullYear();
    
    const monthsENG = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                     'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const months = lang.toUpperCase() === 'ES' ? monthsES : monthsENG;
    const month = months[adjustedDate.getMonth()];
    
    return `${day} ${month} ${year}`;
}
export const getFormatedDate = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    date.setMinutes(date.getMinutes() - offset);
    const formattedDate = date.toISOString().slice(0, 19).replace('T', ' ');
    return formattedDate
}

export const getFormatedDateHours = () => {
    const date = new Date();
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); 
    const year = date.getUTCFullYear();
    let hours = date.getUTCHours();
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const strHours = String(hours).padStart(2, '0');
    return `${day}/${month}/${year} ${strHours}:${minutes}:${seconds} ${ampm}`;
};