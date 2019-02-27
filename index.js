const phantom = require('phantom');
const fs =require('fs');
const timeout=require('./timeout')
//进度条
let bar;
//任务列表
let missionList=[];
//允许的同时并发任务数
const threadCount=3;
//显示未完成文章个数
const showTitleSize=10;
//显示标题最大长度
const showTitleLength=40;
//失败重试次数
const retryTime=3;
//代理端口
const proxyPort=8001;
//web端口
const webPort=8002;

//工作的异步方法，负责重试
async function thread(){
    while(true){
        let item=getItem();
        if(item){
            let time=0;
            if(item.name.length==10)
                console.log('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'+JSON.stringify(item.raw))
            let output='./export/'+item.name+'.pdf';
            while(time<retryTime){
                let error=false;
                await timeout((obj)=>{
                    return savePDF(output,item.url,obj);
                },30000).catch(err=>{
                    error=true;
                    //失败时删除文件
                    if(fs.existsSync(output)){
                        fs.unlinkSync(output);
                    }
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
//启动异步方法
function startThread(){
    for(let i=0;i<threadCount;i++){
        thread().then(()=>{});
    }
}

//从列表中取出一个item 会异步执行 上了锁
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

/**
 * 促使任务进度
 * @param count
 * 完成任务数
 */
function tick(count){
    if(!bar){
        if(missionList.length==0)
            return;
        bar={
            total:missionList.length,
            done:0
        }
        startThread();
    }
    console.log('\033[2J');
    bar.total=missionList.length;
    bar.done+=count;
    console.log(`完成文章数：${bar.done}/${bar.total}`)
    let str='\n待完成文章：';
    let showCount=0;
    let index=0;
    while(showCount<showTitleSize){
        if(index<missionList.length){
            if(missionList[index].done){
                index++;
                continue;
            }
            let name=missionList[index].name;
            str+='\n'+name.substring(0,showTitleLength);
        }else{
            str+='\n'
        }
        index++;
        showCount++;
    }
    console.log(str);
}

/**
 * 公众号页面img等待懒加载结束
 * @param page
 * page引用
 * @param obj
 * timeout obj
 * @returns {Promise<boolean>}
 * 直到完成返回true 否则会在timeout触发phantom exit之后false
 */
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

/**
 * 保存pdf
 * @param name
 * 文件名
 * @param url
 * 链接
 * @param obj
 * timeout obj
 * @returns {Promise<any>}
 *
 */
function savePDF(output,url,obj){
    return new Promise((resolve,reject)=>{
        if(fs.existsSync(output)){
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
                            }).catch(err=>{
                                reject(err);
                            })
                        });
                    }).catch(err=>{
                        reject(err);
                    })
                });
            }).catch(err=>{
                reject(err);
            });
        }).catch(err=>{
            reject(err);
        });
    })

}

/**
 * html转义 并删除\
 * @param a
 * @returns {string}
 */
function unescapeHTML(a){
    a = "" + a;
    return a.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g,' ').replace(/\\/g,'');
}

/**
 * 去除文件名禁用字符
 * @param name
 * @returns {void | string | never}
 */
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
                //该接口第一次返回html文件，数据在html中，第二次起，数据为json
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
                            //分离数据并且转义
                            let str=unescapeHTML(body.substring(index,lastIndex))
                            //console.log(str.substring(16500,17000))
                            obj=JSON.parse(str);
                        }
                    }
                }
                if(obj){
                    for(let item of obj.list||[]){
                        //html中的数据被2层转义了&符号，将再进行一次转义
                        missionList.push({
                            name:replaceFileName(unescapeHTML(item.app_msg_ext_info.title)+item.comm_msg_info.id),
                            url:unescapeHTML(item.app_msg_ext_info.content_url),
                            raw:item
                        });
                    }
                    //触发进度
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