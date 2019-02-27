module.exports=function(func,timeout){
    return new Promise((resolve,reject)=>{
        let obj={
            done:false,
            cancel:false
        }
        let timer=setTimeout(()=>{
            obj.cancel=true;
            if(obj.cancelFunc){
                obj.cancelFunc();
            }
            reject('time out!');
        },timeout);
        func(obj)
            .then(res=>{
                clearTimeout(timer);
                resolve(res);
            })
            .catch(err=>{
            reject(err);
        })
    })
}