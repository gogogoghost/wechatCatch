const phantom = require('phantom');
const fs =require('fs');
const ProgressBar=require('ascii-progress')
const timeout=require('./timeout')


let bar;

let missionList=[];

const threadCount=3;
const showTitleSize=10;
const lineWidth=60;
const retryTime=3;
const proxyPort=8001;
const webPort=8002;

async function thread(){
    while(true){
        let item=getItem();
        if(item){
            let time=0;
            while(time<retryTime){
                let error=false;
                await timeout((obj)=>{
                    return savePDF(item.name,item.url,obj);
                },30000).catch(err=>{
                    error=true;
                    console.log(err);
                });
                if(!error)
                    break;
                time++;
            }
            if(time==retryTime){
                item.error=true;
                console.log(item);
                console.log('重试3次出错')
            }else{
                item.done=true;
            }
            tick(1)
        }
        await new Promise(resolve=>{setTimeout(resolve,500)});
    }
}

function startThread(){
    for(let i=0;i<threadCount;i++){
        thread().then(()=>{});
    }
}
let itemGetting=false;
let itemIndex=0;

function getItem(){
    if(itemGetting)
        return null;
    itemGetting=true;
    let item=missionList[itemIndex];
    if(item)
        itemIndex++;
    itemGetting=false;
    return item;
}
let emptyStr='';
for(let i=0;i<lineWidth;i++){
    emptyStr+=' ';
}
function getOrderedName(name){
    let length=0;
    let index=0;
    for(let c of name){
        if(/[\u4E00-\u9FA5\uF900-\uFA2D\uFF00-\uFFEF]/.test(c)){
            length+=2;
        }else{
            length+=1;
        }
        if(length>lineWidth){
            break;
        }
        index++;
    }
    let sub=name.substring(0,index);
    while(sub.length<lineWidth){
        sub+=' ';
    }
    return sub;
}
//console.log(getOrderedName('我的我的我我的我的我我的我的我我的我的我我的我的我我的我的我111222'))
//return;
function tick(count){
    if(!bar){
        if(missionList.length==0)
            return;
        bar = new ProgressBar({
            current: 0,
            total:missionList.length,
            schema:'[:bar.cyan] :current/:total :percent 已完成文章'
        });
        console.log('\033[2J');
        startThread();
    }
    console.log('\033[0f');
    bar.total=missionList.length;
    bar.completed=false;
    bar.tick(count);
    console.log('\033[0f');
    let str='';
    let showCount=0;
    let index=0;
    while(showCount<showTitleSize){
        if(index<missionList.length){
            if(missionList[index].done){
                index++;
                continue;
            }
            let name=missionList[index].name;
            str+='\n'+getOrderedName(name);
        }else{
            str+='\n'+emptyStr
        }
        index++;
        showCount++;
    }
    console.log(str);
}

async function checkImgDone(page,obj){
    while(!obj.cancel){
        let error=false;
        let result=await page.evaluate(function(){
            var list=document.querySelectorAll('img');
            for(var i=0;i<list.length;i++){
                var item=list[i];
                if(item.getAttribute('data-node')){
                    if(!item.getAttribute('data-done'))
                        return false;
                }
            }
            return true;
        }).catch((err)=>{
            error=true;
        })
        if(error)
            return false;
        if(result)
            return true;
        else{
            await new Promise(resolve=>{setTimeout(resolve,2000)});
        }
    }
}

function savePDF(name,url,obj){

    //console.log('开始保存：'+name);
    return new Promise((resolve,reject)=>{
        let output='./export/'+name+'.pdf'
        if(fs.existsSync(output)){
            //console.log('发现重复，跳过：'+name);
            resolve();
            return;
        }
        phantom.create().then(function(ph) {
            obj.cancelFunc=()=>{
                ph.exit();
                reject('closed by timeout!');
            }
            ph.createPage().then(function(page) {
                page.open(url).then(function(status) {
                    page.property('viewportSize',{width: 750});
                    page.evaluate(function () {
                        var list=document.querySelectorAll('img');
                        var count=0;
                        for(var i=0;i<list.length;i++){
                            var item=list[i];
                            var src=item.getAttribute('data-src');
                            if(src){
                                item.onload=function(){
                                    this.setAttribute('data-done',true);
                                }
                                item.setAttribute('data-node',true);
                                item.src=src;
                                count++;
                            }
                        }
                        return count;
                    }).then(()=>{
                        checkImgDone(page,obj).then(result=>{
                            page.render(output).then(function(){
                                ph.exit();
                                resolve();
                            })
                        });
                    }).catch(err=>{
                        reject(err);
                    })
                });
            });
        });
    })

}

function unescapeHTML(a){
    a = "" + a;
    return a.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g,' ').replace(/\\/g,'');
}
function replaceFileName(name){
    return name.replace(/[\\\\/:*?\"<>| ]/g,'')
}

const AnyProxy = require('anyproxy');
const options = {
    port: proxyPort,
    webInterface: {
        enable: true,
        webPort: webPort
    },
    rule:{
        beforeSendResponse(requestDetail, responseDetail){
            if(requestDetail.url.startsWith('https://mp.weixin.qq.com/mp/profile_ext')){
                let body=responseDetail.response.body.toString();
                let obj;
                try{
                    obj=JSON.parse(body);
                    obj=JSON.parse(obj.general_msg_list);
                }catch (e) {
                    //捕获到了html
                    let startStr='var msgList = \'';
                    let index=body.indexOf(startStr)
                    if(index>=0){
                        index+=startStr.length;
                        let lastIndex=body.indexOf('\'',index);
                        if(lastIndex>=0){
                            let str=unescapeHTML(body.substring(index,lastIndex))
                            //console.log(str.substring(16500,17000))
                            obj=JSON.parse(str);
                        }
                    }
                }
                if(obj){
                    for(let item of obj.list||[]){
                        missionList.push({name:replaceFileName(unescapeHTML(item.app_msg_ext_info.title)),url:unescapeHTML(item.app_msg_ext_info.content_url)});
                    }
                    tick(0);
                }
            }
            return new Promise((resolve)=>{
                resolve();
            })
        }
    },
    forceProxyHttps: true,
    wsIntercept: false, // 不开启websocket代理
    silent: true
};

function getIPAdress(){
    var interfaces = require('os').networkInterfaces();
    for(var devName in interfaces){
        var iface = interfaces[devName];
        for(var i=0;i<iface.length;i++){
            var alias = iface[i];
            if(alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal){
                return alias.address;
            }
        }
    }
}

const proxyServer = new AnyProxy.ProxyServer(options);

proxyServer.on('ready', () => {
    console.log('IP:'+getIPAdress());
    console.log('Proxy Port:'+proxyPort);
    console.log('Web Port:'+webPort);
});
proxyServer.on('error', (e) => { /* */ });
proxyServer.start();