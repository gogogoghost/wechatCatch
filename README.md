## wechatCatch

自用版公众号抓取工具，生成PDF

基于anyproxy，配合手机一起使用抓取公众号文章保存为PDF

生成证书，安装证书请根据[anyproxy](https://anyproxy.io)文档参考

使用手机设置代理，打开公众号历史消息页面，待数据包被捕获后会自动开始获取页面保存到export目录

```bash
$ git clone https://github.com/gogogoghost/wechatcatch

$ cd wechatcatch

$ npm i

$ node index

```

生成的PDF文件命名规则为

```js
return `${page.id}${page.isSubPage?'-'+page.subIndex:''}${page.title}.pdf`
```

运行期间按Enter可以使ERROR的文章变为RETRY