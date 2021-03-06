/**
 * Created by zppro on 16-10-12.
 * api for mobile web app
 */
var rp = require('request-promise-native');
var IDC01 = require('../pre-defined/dictionary.json')['IDC01'];
var IDC02 = require('../pre-defined/dictionary.json')['IDC02'];
var DIC = require('../pre-defined/dictionary-constants.json');
var externalSystemConfig = require('../pre-defined/external-system-config.json');
module.exports = {
    init: function (option) {
        var self = this;
        this.file = __filename;
        this.filename = this.file.substr(this.file.lastIndexOf('/') + 1);
        this.module_name = this.filename.substr(0, this.filename.lastIndexOf('.'));
        this.service_url_prefix = '/me-services/' + this.module_name.split('_').join('/');
        this.log_name = 'mesvc_' + this.filename;
        option = option || {};

        this.logger = require('log4js').getLogger(this.log_name);

        if (!this.logger) {
            console.error('logger not loaded in ' + this.file);
        }
        else {
            this.logger.info(this.file + " loaded!");
        }

        this.actions = [
            /************************设备相关*****************************/
            {
                method: 'FourSeasonTour',
                verb: 'post',
                url: this.service_url_prefix + "/FourSeasonTour",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            // send
                            var payload = app._.extend({platform: DIC.D0100.MOBILE, app_id: DIC.D0102.FourSeasonTour}, this.request.body);
                            var deviceAccess = yield app.modelFactory().model_one(app.models['pub_deviceAccess'], {
                                where: {app_id: DIC.D0102.FourSeasonTour, uuid: payload.uuid}
                            });
                            if (deviceAccess) {
                                deviceAccess.access_times += 1;
                                yield deviceAccess.save();
                            } else {
                                deviceAccess = yield app.modelFactory().model_create(app.models['pub_deviceAccess'], payload);
                            }

                            var ret = {};
                            var appServers = yield app.modelFactory().model_query(app.models['pub_appServerSideUpdateHistory'], {
                                where: {app_id: DIC.D0102.FourSeasonTour},
                                sort: {ver_order: -1, check_in_time: -1}
                            }, {limit: 1});
                            console.log(appServers);
                            if (appServers.length > 0) {
                                ret.server_hash = appServers[0].id;
                                ret.server_ver = appServers[0].ver;
                            } else {
                                ret.server_hash = "0";
                                ret.server_ver = "0.0.1";
                            }

                            var appClients = yield app.modelFactory().model_query(app.models['pub_appClientSideUpdateHistory'], {
                                where: {app_id: DIC.D0102.FourSeasonTour, os: payload.os},
                                sort: {ver_order: -1, check_in_time: -1}
                            }, {limit: 1});
                            console.log(appClients);
                            if (appClients.length > 0) {
                                ret.client_hash = appClients[0].id;
                                ret.client_ver = appClients[0].ver;
                                ret.client_force_update = appClients[0].force_update_flag;
                                ret.client_download_url = appClients[0].download_url;
                            } else {
                                ret.client_hash = "0";
                                ret.client_ver = "0.0.1";
                                ret.client_force_update = false;
                                ret.client_download_url = "";
                            }
                            this.body = app.wrapper.res.ret(ret);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'updateContent',
                verb: 'post',
                url: this.service_url_prefix + "/updateContent",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            // send
                           
                            var rows = yield app.modelFactory().model_query(app.models['trv_experience'],{where: {status: 1, retweet_flag: true}})
                            for(var i=0;i < rows.length;i++) {
                                rows[i].pure_content && (rows[i].content = yield app.member_service.addHrefToName(rows[i].pure_content));
                                yield rows[i].save(); 
                            }
                            this.body = app.wrapper.res.rows(rows);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'reStatMemberInfo',
                verb: 'post',
                url: this.service_url_prefix + "/reStatMemberInfo/:memberId?",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            if(this.params.memberId) {
                                console.log(this.params.memberId);
                                yield app.member_service.reStatInfo(this.params.memberId)
                            } else {
                                var rows = yield app.modelFactory().model_query(app.models['trv_member'])
                                for (var i = 0; i < rows.length; i++) {
                                    console.log(rows[i].code)
                                    yield app.member_service.reStatInfo(rows[i].code)
                                }
                            }

                            this.body = app.wrapper.res.default();
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            /************************票付通相关*****************************/
            {
                method: 'scenicSpots',
                verb: 'get',
                url: this.service_url_prefix + "/scenicSpots",
                handler: function (app, options) {
                    return function * (next) {
                        try {

                            var lowPriceTicketsPerScenicSpot = yield app.modelFactory().model_aggregate(app.models['idc_ticket_PFT'], [
                                {
                                    $match: {
                                        status: 1
                                    }
                                },
                                {
                                    $group: {
                                        _id: {UUlid: '$UUlid'},
                                        price: {$min: '$sale_price'}
                                    }
                                },
                                {$sort: {"price": 1}},
                                {
                                    $project: {
                                        scenicSpotId: '$_id.UUlid',
                                        price: '$price',
                                        _id: 0
                                    }
                                }
                            ]);

                            var rows_ScenicSpot = yield app.modelFactory().model_query(app.models['idc_scenicSpot_PFT'],{ where: { status:1 }, select: 'UUid show_name UUimgpath UUaddress'});

                            var rows = app._.map(rows_ScenicSpot,function(o) {
                                var price = app._.find(lowPriceTicketsPerScenicSpot, function (item) {
                                    return item.scenicSpotId == o.UUid
                                }).price;
                                return {id:o.id, UUid: o.UUid, title: o.show_name, img: o.UUimgpath, price: price, description: o.UUaddress}
                            });
 
                            this.body = app.wrapper.res.rows(rows);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'scenicSpots',
                verb: 'post',
                url: this.service_url_prefix + "/scenicSpots",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            var lowPriceTicketsPerScenicSpot = yield app.modelFactory().model_aggregate(app.models['idc_ticket_PFT'], [
                                {
                                    $match: {
                                        status: 1
                                    }
                                },
                                {
                                    $group: {
                                        _id: {UUlid: '$UUlid'},
                                        price: {$min: '$sale_price'}
                                    }
                                },
                                {$sort: {"price": 1}},
                                {
                                    $project: {
                                        scenicSpotId: '$_id.UUlid',
                                        price: '$price',
                                        _id: 0
                                    }
                                }
                            ]);

                            var rows_ScenicSpot = yield app.modelFactory().model_query(app.models['idc_scenicSpot_PFT'], {
                                    where: {status: 1},
                                    select: 'UUid show_name UUimgpath UUaddress'
                                },
                                {limit: this.request.body.page.size, skip: this.request.body.page.skip});



                            var rows = [];

                            app._.each(rows_ScenicSpot, function (o) {
                                var scenicSpot = app._.find(lowPriceTicketsPerScenicSpot, function (item) {
                                    return item.scenicSpotId == o.UUid
                                });

                                if (scenicSpot) {
                                    rows.push({
                                        id: o.id,
                                        UUid: o.UUid,
                                        title: o.show_name,
                                        img: o.UUimgpath,
                                        price: scenicSpot.price,
                                        description: o.UUaddress
                                    });
                                }
                            });
                            this.body = app.wrapper.res.rows(rows);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'scenicSpot',
                verb: 'get',
                url: this.service_url_prefix + "/scenicSpot/:scenicSpotId",
                handler: function (app, options) {
                    return function * (next) {
                        try {
                            var scenicSpotId = this.params.scenicSpotId;

                            var scenicSpot = yield app.modelFactory().model_read(app.models['idc_scenicSpot_PFT'],scenicSpotId);
                            var ticketsOfScenicSpot = yield app.modelFactory().model_query(app.models['idc_ticket_PFT'],{ where: { status:1,UUlid: scenicSpot.UUid }, select: 'UUlid UUid show_name sale_price UUtprice UUdelaydays UUddays UUdhour UUbuy_limit_up UUbuy_limit_low UUtourist_info'});

                            var ret = {
                                id: scenicSpot._id,
                                img: scenicSpot.UUimgpath,
                                title: scenicSpot.show_name,
                                buy_quantity: 1,
                                level: scenicSpot.UUjtype,
                                tickets_count: ticketsOfScenicSpot.length,
                                address: scenicSpot.UUaddress,
                                runtime: scenicSpot.UUruntime,
                                tip: scenicSpot.UUjqts,
                                travel_guide: scenicSpot.UUjtzn,
                                introduction_url: scenicSpot.introduction_url
                            };
 
                            var ticketWithMinSalePrice = app._.min(ticketsOfScenicSpot,function(o) {
                                return o.sale_price
                            });
                            
                            if(ticketWithMinSalePrice){
                                ret.selected_ticket_id = ticketWithMinSalePrice._id;
                                ret.selected_ticket_uulid = ticketWithMinSalePrice.UUlid;
                                ret.selected_ticket_uuid = ticketWithMinSalePrice.UUid;
                                ret.selected_ticket_price = ticketWithMinSalePrice.sale_price;
                                ret.selected_ticket_bid_price = ticketWithMinSalePrice.UUtprice;
                                ret.selected_ticket_name = ticketWithMinSalePrice.show_name;
                                ret.selected_ticket_delay_days = ticketWithMinSalePrice.UUdelaydays;
                                ret.selected_ticket_buy_days_in_advance = ticketWithMinSalePrice.UUddays;
                                ret.selected_ticket_buy_hour_in_advance = ticketWithMinSalePrice.UUdhour;
                                ret.selected_ticket_buy_limit_up = ticketWithMinSalePrice.UUbuy_limit_up
                                ret.selected_ticket_buy_limit_low = ticketWithMinSalePrice.UUbuy_limit_low
                                ret.selected_ticket_tourist_IDNo_flag = ticketWithMinSalePrice.UUtourist_info
                            }
                            this.body = app.wrapper.res.ret(ret);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'tickets',
                verb: 'get',
                url: this.service_url_prefix + "/tickets/:scenicSpotId",
                handler: function (app, options) {
                    return function * (next) {
                        try {
                            var scenicSpot = yield app.modelFactory().model_read(app.models['idc_scenicSpot_PFT'],this.params.scenicSpotId);

                            var ticketsOfScenicSpot = yield app.modelFactory().model_aggregate(app.models['idc_ticket_PFT'], [
                                {
                                    $match: {
                                        status: 1,
                                        UUlid: scenicSpot.UUid
                                    }
                                },
                                {$sort: {"sale_price": 1}},
                                {
                                    $project: {
                                        ticket_id: '$_id',
                                        ticket_uulid: '$UUlid',
                                        ticket_uuid: '$UUid',
                                        ticket_price: '$sale_price',
                                        ticket_bid_price: '$UUtprice',
                                        ticket_name: '$show_name',
                                        ticket_delay_days: '$UUdelaydays',
                                        ticket_buy_days_in_advance: '$UUddays',
                                        ticket_buy_hour_in_advance: '$UUdhour',
                                        ticket_buy_limit_up: '$UUbuy_limit_up',
                                        ticket_buy_limit_low: '$UUbuy_limit_low',
                                        ticket_tourist_IDNo_flag: '$UUtourist_info'
                                    }
                                }
                            ]);

                            this.body = app.wrapper.res.rows(ticketsOfScenicSpot);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            /************************本地订单相关*****************************/
            {
                method: 'orders',
                verb: 'post',
                url: this.service_url_prefix + "/orders",
                handler: function (app, options) {
                    return function *(next) {
                        try {

                            var member_id = this.payload.member.member_id;
                            if(member_id == 'anonymity')
                                member_id = 'everyone';
                            var rows = yield app.modelFactory().model_query(app.models['idc_order_PFT'], {
                                    where: {
                                        status: 1,
                                        member_id: member_id
                                    }, select: 'p_name code check_in_time amount local_status local_status_name travel_date UUid', sort: this.request.body.sort || {check_in_time: -1}
                                },
                                {limit: this.request.body.page.size, skip: this.request.body.page.skip});
                            for(var i=0;i< rows.length; i++) {
                                rows[i] = rows[i].toObject();
                                var ticket = yield app.modelFactory().model_one(app.models['idc_ticket_PFT'], {
                                    where: {
                                        UUid: rows[i].UUid
                                    }, select: 'UUdhour -_id'
                                });
                                if(ticket && ticket.UUdhour) {
                                    rows[i].last_pay_time = app.moment(rows[i].travel_date).format('YYYY-MM-DD') + ' '+ ticket.UUdhour;
                                } else {
                                    rows[i].last_pay_time = app.moment(rows[i].travel_date).format('YYYY-MM-DD') + ' 23:59:59';
                                }
                            }
                            //console.log(rows)
                            this.body = app.wrapper.res.rows(rows);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'order',
                verb: 'post',
                url: this.service_url_prefix + "/order",
                handler: function (app, options) {
                    return function *(next) {
                        try {

                            console.log(this.request.body)
                            var ticket = yield app.modelFactory().model_one(app.models['idc_ticket_PFT'], {
                                where: {
                                    UUlid: this.request.body.UUlid,
                                    UUid: this.request.body.UUid
                                }
                            });
                            if (!ticket) {
                                this.body = app.wrapper.res.error({code: 52001, message: '无效的门票编号'});
                                yield next;
                            }

                            if(ticket.UUtourist_info == 1){
                                var IDNo = this.request.body.tourist_id_no;
                                var isIDNo = yield app.pft.checkIDNo(self.logger,this.request.body.tourist_id_no);
                                if (!isIDNo) {
                                    this.body = app.wrapper.res.error({code: 52002, message: '无效的身份证号码'});
                                    yield next;
                                }
                            }
                            
                            var order = app._.extend({
                                code: 'server-gen',
                                local_status: 'A0001',
                                ticketId: ticket._id,
                                UUtprice: ticket.UUtprice,
                                UUaid: ticket.UUaid,
                                sms_send: 0,
                                deduction_type: 0,
                                order_type: 0,
                                UUstatus: 0,
                                UUpaystatus: 2
                            }, this.payload.member, this.request.body);
                            order.amount = order.p_price * order.quantity;
                            console.log(order);
                            this.body = app.wrapper.res.ret(yield app.modelFactory().model_create(app.models['idc_order_PFT'], order));
                        } catch (e) {
                            console.log(e);
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'order-details',
                verb: 'get',
                url: this.service_url_prefix + "/order-details/:orderId",
                handler: function (app, options) {
                    return function * (next) {
                        try {

                            var order = yield app.modelFactory().model_read(app.models['idc_order_PFT'],this.params.orderId);
                            var ticket = yield app.modelFactory().model_one(app.models['idc_ticket_PFT'], {where: {UUid: order.UUid}});
                            var scenicSpot = yield app.modelFactory().model_one(app.models['idc_scenicSpot_PFT'],{where: {UUid: order.UUlid}});

                            var pay_type = order.pay_type;
                            if(pay_type){
                                pay_type = IDC02[order.pay_type].name;
                            } else {
                                pay_type = '';
                            }
                            console.log(order.id)
                            var last_pay_time = app.moment(app.moment(order.travel_date).format('YYYY-MM-DD') + ' '+ ticket.UUdhour).toDate();
                            var ret = {
                                orderInfo: {
                                    orderId: order.id,
                                    pay_type: pay_type,
                                    status: order.local_status,
                                    status_name: IDC01[order.local_status].name,
                                    code: order.code,
                                    check_in_time: order.check_in_time,
                                    pay_time: order.pay_time,
                                    price: order.p_price,
                                    quantity: order.quantity,
                                    amount: order.amount,
                                    link_man: order.link_man,
                                    link_phone: order.link_phone,
                                    travel_date: order.travel_date,
                                    validate_code_status: order.UUstatus || 0,
                                    qr_show: (order.local_status == 'A0005' || order.local_status == 'A0009' || order.local_status == 'A0011'),
                                    validate_code: order.UUcode,//凭证号
                                    qrcode_img: order.UUqrcodeIMG//二维码图片
                                },
                                scenicSpotInfo: {
                                    name: scenicSpot.show_name,
                                    ticket_name: order.p_name,
                                    last_pay_time: last_pay_time,//最迟下单时间
                                    img: scenicSpot.UUimgpath,
                                    level: scenicSpot.UUjtype,
                                    tel: scenicSpot.UUtel,
                                    runtime: scenicSpot.UUruntime,
                                    address: scenicSpot.UUaddress,
                                    tip: scenicSpot.UUjqts
                                }
                            }
                            this.body = app.wrapper.res.ret(ret);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'order',
                verb: 'put',
                url: this.service_url_prefix + "/order/:id",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            // send
                            var payload = app._.extend({pay_time: Date.now()}, this.request.body);
                            var ret = yield app.modelFactory().model_update(app.models['idc_order_PFT'], this.params.id, payload);
                            var theOrder = yield app.modelFactory().model_read(app.models['idc_order_PFT'], this.params.id);
                            yield app.mail.send$PFTOrderPaySuccess(theOrder);
                            this.body = app.wrapper.res.default();
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            /************************代理登录相关*****************************/
            {
                method: 'proxyLogin',
                verb: 'post',
                url: this.service_url_prefix + "/proxyLogin",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            var ret1 = yield rp({method: 'POST', url: externalSystemConfig.member_repository_php.api_url + '/api/login/index.html', form: this.request.body, json: true});
                            if (ret1.err_code == '0') {
                                var token = ret1.info.token;
                                var ret2 = yield rp({url: externalSystemConfig.member_repository_php.api_url + '/api/personal/info.html?token=' + token, json: true});
                                if (ret2.err_code == '0') {
                                    this.body = app.wrapper.res.ret({memberInfo: {member_id: ret2.info.u_id, member_name: ret2.info.u_nickname, head_portrait: ret2.info.u_headpic, member_description: ret2.info.u_description}, token: token});
                                    //会员服务
                                    yield app.member_service.checkIn(ret2.info.u_id, ret2.info.u_nickname, ret2.info.u_headpic);
                                }
                                else {
                                    this.body = app.wrapper.res.error({code: ret2.err_code, message: ret2.message});
                                }
                            }
                            else {
                                this.body = app.wrapper.res.error({code: ret1.err_code, message: ret1.message});
                            }
                        } catch (e) {
                            console.log(e);
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'proxyLoginByToken',
                verb: 'post',
                url: this.service_url_prefix + "/proxyLoginByToken",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            var token = this.request.body.token;
                            var ret2 = yield rp({url: externalSystemConfig.member_repository_php.api_url + '/api/personal/info.html?token=' + token, json: true});
                            if (ret2.err_code == '0') {
                                this.body = app.wrapper.res.ret({memberInfo: {member_id: ret2.info.u_id, member_name: ret2.info.u_nickname, head_portrait: ret2.info.u_headpic, member_description: ret2.info.u_description}, token: token});
                                //会员服务
                                yield app.member_service.checkIn(ret2.info.u_id, ret2.info.u_nickname, ret2.info.u_headpic);
                            }
                            else {
                                this.body = app.wrapper.res.error({code: ret2.err_code, message: ret2.message});
                            }
                        } catch (e) {
                            console.log(e);
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            {
                method: 'proxyLoginByWeiXinOpenIdSyncToAPICloud',
                verb: 'post',
                url: this.service_url_prefix + "/proxyLoginByWeiXinOpenIdSyncToAPICloud",
                handler: function (app, options) {
                    return function *(next) {
                        try {
                            var ret1 = yield rp({method: 'POST', url: externalSystemConfig.member_repository_php.api_url + '/api/login/index.html', form: {
                                category : 1,
                                wxopenid : this.request.body.openid,
                                wxunionid : this.request.body.unionid,
                                nickname : this.request.body.nickname,
                                gender: this.request.body.sex,
                                language : '',
                                country : this.request.body.country,
                                province : this.request.body.province,
                                city : this.request.body.city,
                                headpic : this.request.body.headimgurl,
                                uuid : this.request.body.apiUUID
                            }, json: true});
                            if (ret1.err_code == '0') {
                                var token = ret1.info.token;
                                var ret2 = yield rp({url: externalSystemConfig.member_repository_php.api_url + '/api/personal/info.html?token=' + token, json: true});
                                if (ret2.err_code == '0') {
                                    console.log(ret2)
                                    this.body = app.wrapper.res.ret({memberInfo: {member_id: ret2.info.u_id, member_name: ret2.info.u_nickname, head_portrait: ret2.info.u_headpic, member_description: ret2.info.u_description}, token: token});
                                    //会员服务
                                    yield app.member_service.checkIn(ret2.info.u_id, ret2.info.u_nickname, ret2.info.u_headpic);
                                }
                                else {
                                    this.body = app.wrapper.res.error({code: ret2.err_code, message: ret2.message});
                                }
                            }
                            else {
                                this.body = app.wrapper.res.error({code: ret1.err_code, message: ret1.message});
                            }
                        } catch (e) {
                            console.log(e);
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            /************************微信相关*****************************/
            {
                method: 'getMPWeiXinConfig',
                verb: 'get',
                url: this.service_url_prefix + "/getMPWeiXinConfig",
                handler: function (app, options) {
                    return function * (next) {
                        try {
                            console.log(this.host)
                            var config = yield app.mp_weixin.createWXConfig(this.host);
                            console.log(config)
                            this.body = app.wrapper.res.ret(config);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            },
            /************************字典相关*****************************/
            {
                method: 'd',
                verb: 'get',
                url: this.service_url_prefix + "/d/:key",
                handler: function (app, options) {
                    return function * (next) {
                        try {
                            var rows = [];
                            app._.each(app.dictionary.pairs[this.params.key.toUpperCase()],function(v,k) {
                                if (k != 'name') {
                                    rows.push({label: v.name, value: k})
                                }
                            })
                            this.body = app.wrapper.res.rows(rows);
                        } catch (e) {
                            self.logger.error(e.message);
                            this.body = app.wrapper.res.error(e);
                        }
                        yield next;
                    };
                }
            }
        ];

        return this;
    }
}.init();
//.init(option);