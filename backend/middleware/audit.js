const {getDb}=require('../db');
function auditLog(req,res,next){next();}
function auditLoginAttempt(req,res,next){next();}
module.exports={auditLog,auditLoginAttempt};
