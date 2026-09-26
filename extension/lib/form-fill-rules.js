/**
 * Local-only form matching rules.
 *
 * This module deliberately does not know about the DOM. Callers must pass
 * hasValue rather than the value itself, so existing page input can neither be
 * retained nor appear in the report.
 *
 * Matching is scored rather than all-or-nothing. Every candidate field is run
 * against a rule table covering nine profile sections, and the best rule above
 * SCORE_THRESHOLD wins. Two mechanisms keep that broad coverage from filling
 * the wrong box:
 *
 * - A section hint inferred from the field's own wording and its surrounding
 *   page text gates rules belonging to other sections, so a generic label such
 *   as “描述” or “开始时间” cannot land in the wrong repeating block.
 * - Descriptor vetoes reject the classic confusions (a “姓名拼音” box is not a
 *   name, a “学校名称” box is not a date, a country-code picker is not a phone
 *   number).
 *
 * Repeated sections additionally map the Nth page block onto the Nth saved
 * record, so a second “公司名称” box reads the second internship.
 */

const SCORE_THRESHOLD = 0.68

/** Aliases this generic only disambiguate when the section is already known. */
const GENERIC_ALIASES = new Set(['描述', '经历描述', '职责描述', '内容', '说明', '详情', 'description', 'details', 'content'])

const SENSITIVE_PATTERNS = [
  /(?:password|passcode|密码|口令)/i,
  /(?:captcha|verification\s*code|verify\s*code|验证码|校验码|动态码|短信码)/i,
  /(?:身份证|证件号|证件号码|护照|passport|identity\s*(?:card|number)|id\s*(?:card|number))/i,
  /(?:银行卡|银行账户|开户行|bank\s*(?:card|account)|payment|支付)/i,
  /(?:隐私|个人信息授权|隐私政策|同意声明|法律声明|授权声明|privacy|consent|declaration|agreement)/i,
  /(?:上传|附件|文件|upload|attachment|resume\s*file)/i,
]

/** The document-number rule is intentionally exempt so a saved ID can be filled. */
const EXEMPT_SENSITIVE_PATTERN_INDEX = 2

const CATEGORY_PATTERNS = [
  ['work', /(?:工作经历|工作经验|实习经历|实习经验|任职|雇主|公司经历|work\s*(?:experience|history)|internship|employment)/i],
  ['project', /(?:项目经历|项目经验|项目名称|项目描述|project)/i],
  ['campus', /(?:校园|社团|学生工作|campus)/i],
  ['award', /(?:获奖|奖项|荣誉|award|honou?r)/i],
  ['certificate', /(?:证书|资格证|certificat|qualification)/i],
  ['language', /(?:语言能力|外语|language)/i],
  ['self_evaluation', /(?:自我评价|个人评价|个人总结|自我介绍|self[\s-]*(?:evaluation|assessment|introduction)|professional\s*summary)/i],
]

/**
 * Option synonyms. Application forms rarely reuse the exact wording saved in a
 * profile (“本科” vs “大学本科”, “中共党员” vs “中共党员（含预备）”), so a select
 * or radio group is matched through this table before falling back to包含匹配.
 */
const OPTION_ALIASES = [
  ['男', ['男', '男性', 'male', 'm']],
  ['女', ['女', '女性', 'female', 'f']],
  ['大专', ['大专', '专科', '专科生', '高职', 'associate']],
  ['本科', ['本科', '大学本科', '学士', 'bachelor', 'undergraduate']],
  ['硕士', ['硕士', '硕士研究生', '研究生', 'master', 'graduate']],
  ['博士', ['博士', '博士研究生', 'phd', 'doctor', 'doctoral']],
  ['群众', ['群众', '普通群众', '无党派人士', '无党派']],
  ['共青团员', ['共青团员', '中国共青团员', '团员']],
  ['中共党员', ['中共党员', '中国共产党党员', '党员']],
  ['中共预备党员', ['中共预备党员', '预备党员']],
  ['全日制', ['全日制', '普通全日制', '统招', '统招本科']],
  ['非全日制', ['非全日制', '在职', '在职研究生']],
  ['未婚', ['未婚']],
  ['已婚', ['已婚', '已婚已育']],
  ['中国', ['中国', '中国大陆', '中华人民共和国', 'china', 'chinese']],
  ['居民身份证', ['居民身份证', '身份证', '中华人民共和国居民身份证']],
  ['英语', ['英语', '英文', 'english']],
]

const SECTION_ALIASES = {
  education: ['教育', '学历', '学校', '院校', '专业', '学位', '毕业', 'education', 'school', 'university', 'academic'],
  work: ['工作经历', '工作经验', '实习经历', '实习经验', '任职', '公司', '单位', 'work', 'internship', 'employment'],
  project: ['项目经历', '项目经验', '项目名称', '项目描述', 'project'],
  campus: ['校园经历', '社团', '学生工作', '活动经历', 'campus', 'activity'],
  awards: ['获奖', '奖项', '荣誉', '竞赛', 'award', 'honor', 'prize'],
  certificates: ['证书', '认证', '资格证', 'certificate', 'certification'],
  languages: ['语言能力', '外语', '语种', 'language'],
  skills: ['技能', '技术栈', '专业能力', 'skill', 'technical'],
}

/** Section hints tested in order; the first hit wins. */
const SECTION_HINTS = [
  ['awards', /获奖名称|奖项名称|荣誉名称|获奖时间|竞赛名称|awardname|awardtitle/i],
  ['project', /项目经历|项目名称|项目角色|项目链接|项目描述|项目内容|projectexperience|projectname|projectrole|projectdescription/i],
  ['education', /学校名称|毕业院校|入学时间|毕业时间|schoolname|educationlevel|universityname/i],
  ['work', /公司名称|工作经历|实习经历|任职经历|companyname|workexperience|employment/i],
  ['campus', /校园经历|学生工作名称|社团名称|活动名称|campustitle|activityname/i],
  ['certificates', /证书名称|资格证书|认证名称|发证日期|获证日期|certificationname|licensedate/i],
  ['languages', /语言名称|外语名称|语种|languagename/i],
]

/** Own wording that pins a field to the basic section regardless of its block. */
const BASIC_OWN_WORDS = /出生日期|出生年月|生日|birthdate|dateofbirth|dob|姓名|中文姓名|真实姓名|fullname|legalname|邮箱|电子邮箱|emailaddress|手机|手机号码|联系电话|phonenumber|身份证|护照|passport/i

/** Own wording that means “free text”: never lock these to a section. */
const FREE_TEXT_OWN_WORDS = /自我描述|自我评价|个人总结|个人优势|个人简介|个人概述|自我介绍|selfdescription|selfsummary|personalsummary|profilesummary/i

const REPEATABLE_SECTIONS = ['education', 'work', 'project', 'campus', 'awards', 'certificates', 'languages']

const ANCHOR_KEYS = {
  education: 'education.school',
  work: 'work.company',
  project: 'project.name',
  campus: 'campus.name',
  awards: 'awards.name',
  certificates: 'certificates.name',
  languages: 'languages.name',
}

const COMPOUND_SURNAMES = ['欧阳', '司马', '上官', '皇甫', '令狐', '诸葛', '司徒', '公孙']

/**
 * `read` pulls the value for a page block. `index` is the record index inside a
 * repeating section and is always 0 for single-valued rules.
 *
 * `endOfMonth` marks end dates: when only a month is known and the page wants a
 * full date, the last day of that month is the honest answer.
 */
const RULES = [
  // ---------------------------------------------------------------- basics
  { key: 'basics.fullName', section: 'basic', aliases: ['姓名', '真实姓名', '中文姓名', '名字', '全名', '考生姓名', '申请人姓名', '您的姓名', 'name', 'fullname', 'yourname', 'legalname', 'chinesename'], read: c => c.basics.fullName },
  { key: 'basics.familyName', section: 'basic', aliases: ['姓氏', 'lastname', 'familyname', 'surname'], read: c => familyNameOf(c.basics.fullName) },
  { key: 'basics.givenName', section: 'basic', aliases: ['名字（不包含姓氏）', 'firstname', 'givenname'], read: c => givenNameOf(c.basics.fullName) },
  { key: 'basics.gender', section: 'basic', aliases: ['性别', '男女', 'gender', 'sex'], read: c => c.basics.gender },
  { key: 'basics.birthDate', section: 'basic', aliases: ['出生日期', '出生年月', '出生年月日', '生日', '出生时间', 'birthdate', 'dateofbirth', 'birthday', 'dob'], date: true, read: c => c.basics.birthDate },
  { key: 'basics.age', section: 'basic', aliases: ['年龄', 'age'], derived: true, read: c => ageFromBirthDate(c.basics.birthDate) },
  { key: 'basics.phone', section: 'basic', aliases: ['手机', '手机号', '手机号码', '联系电话', '电话号码', '移动电话', '联系手机', '联系方式', 'phone', 'mobile', 'tel', 'telephone', 'cellphone', 'phonenumber'], types: ['tel'], read: c => c.basics.phone },
  { key: 'basics.email', section: 'basic', aliases: ['邮箱', '电子邮箱', '电子邮件', '邮件地址', 'email', 'emailaddress', 'mail'], types: ['email'], read: c => c.basics.email },
  // The shared “个人证件 / 证件信息” label is claimed by both document rules; the
  // control shape decides which one, in `isDescriptorCompatible`.
  { key: 'basics.documentNumber', section: 'basic', aliases: ['身份证', '身份证号', '身份证号码', '证件号码', '证件号', '个人证件', '证件信息', 'document', 'idnumber', 'idcard', 'identitycard', 'documentnumber'], read: c => c.basics.documentNumber },
  { key: 'basics.documentType', section: 'basic', aliases: ['证件类型', '个人证件', '个人证件类型', '证件类别', 'documenttype', 'idtype'], read: c => c.basics.documentType },
  { key: 'basics.ethnicity', section: 'basic', aliases: ['民族', '族别', 'ethnicity', 'ethnicgroup'], read: c => c.basics.ethnicity },
  { key: 'basics.politicalStatus', section: 'basic', aliases: ['政治面貌', '政治身份', '党派', 'politicalstatus', 'politicalaffiliation'], read: c => c.basics.politicalStatus },
  { key: 'basics.nativePlace', section: 'basic', aliases: ['籍贯', '原籍', 'nativeplace', 'hometown', 'placeoforigin'], read: c => c.basics.nativePlace },
  { key: 'basics.householdLocation', section: 'basic', aliases: ['户籍', '户籍所在地', '户口', '户口所在地', '户口性质', 'householdregistration'], read: c => c.basics.householdLocation },
  { key: 'basics.city', section: 'basic', aliases: ['现居城市', '居住城市', '现居住地', '当前所在地', '目前所在城市', '所在城市', '所在地区', '常住地', '城市', 'currentcity', 'currentlocation', 'city'], read: c => c.basics.city },
  { key: 'basics.countryRegion', section: 'basic', aliases: ['国家', '国家地区', '国籍', 'country', 'nationality'], read: c => c.basics.countryRegion },
  { key: 'basics.wechatId', section: 'basic', aliases: ['微信', '微信号', '微信账号', 'wechat', 'weixin'], read: c => c.basics.wechatId },
  { key: 'basics.maritalStatus', section: 'basic', aliases: ['婚姻状况', '婚姻状态', 'maritalstatus'], read: c => c.basics.maritalStatus },
  { key: 'basics.heightCm', section: 'basic', aliases: ['身高', 'height'], read: c => c.basics.heightCm },
  { key: 'basics.weightKg', section: 'basic', aliases: ['体重', 'weight'], read: c => c.basics.weightKg },
  { key: 'basics.emergencyContactName', section: 'basic', aliases: ['紧急联系人', '紧急联系人姓名', 'emergencycontact', 'emergencycontactname'], read: c => c.basics.emergencyContactName },
  { key: 'basics.emergencyContactRelation', section: 'basic', aliases: ['紧急联系人关系', '与紧急联系人关系', '紧急联系人及关系', 'emergencycontactrelation'], read: c => c.basics.emergencyContactRelation },
  { key: 'basics.emergencyContactPhone', section: 'basic', aliases: ['紧急联系电话', '紧急联系人电话', '紧急联系人手机', 'emergencycontactphone'], types: ['tel'], read: c => c.basics.emergencyContactPhone },
  { key: 'basics.targetCity', section: 'basic', aliases: ['期望工作地点', '意向工作地点', '期望工作城市', '期望城市', '意向城市', '意向工作地', '期望工作地', 'preferredcity', 'expectedlocation', 'worklocation'], read: c => c.targetCity },
  { key: 'basics.expectedSalary', section: 'basic', aliases: ['期望薪资', '期望薪酬', '薪资期望', '薪资要求', '期望月薪', 'expectedsalary', 'salaryexpectation'], read: c => c.expectedSalary },
  // “入职时间” means availability on a basic-info form and a work start date
  // inside an experience block; marking it as a date lets the section hint
  // decide, because dates never cross sections on a label match alone.
  { key: 'basics.availableDate', section: 'basic', aliases: ['到岗时间', '最早到岗', '可到岗时间', '可到岗', '入职时间', '可入职时间', '到岗日期', 'availabledate'], date: true, read: c => c.availableDate },
  { key: 'basics.selfEvaluation', section: 'basic', aliases: ['自我评价', '自我介绍', '个人简介', '个人评价', '个人总结', '个人优势', '自我描述', '个人陈述', 'selfintroduction', 'aboutme', 'selfassessment', 'profilesummary'], multiline: true, read: c => c.selfEvaluation },

  // ------------------------------------------------------------- education
  { key: 'education.school', section: 'education', collection: 'educations', aliases: ['学校', '学校名称', '毕业院校', '毕业学校', '院校', '所学学校', '就读学校', '本科学校', '硕士学校', '所在学校', '大学', 'school', 'university', 'college', 'institution', 'schoolname'], read: (c, i) => c.educations[i]?.school },
  { key: 'education.college', section: 'education', collection: 'educations', aliases: ['学院', '院系', '所在学院', '所属学院', 'faculty', 'department'], read: (c, i) => c.educations[i]?.college },
  { key: 'education.major', section: 'education', collection: 'educations', aliases: ['专业', '专业名称', '所学专业', '主修专业', '就读专业', '专业方向', 'major', 'fieldofstudy', 'discipline'], read: (c, i) => c.educations[i]?.major },
  { key: 'education.educationLevel', section: 'education', collection: 'educations', aliases: ['学历', '最高学历', '学历层次', '学历类型', 'educationlevel', 'qualification'], read: (c, i) => c.educations[i]?.educationLevel || c.educations[i]?.degree },
  { key: 'education.academicDegree', section: 'education', collection: 'educations', aliases: ['学位', '最高学位', '学位名称', '学位类别', 'academicdegree'], read: (c, i) => c.educations[i]?.academicDegree || c.educations[i]?.degree },
  { key: 'education.startDate', section: 'education', collection: 'educations', aliases: ['入学时间', '入学日期', '入学年月', '就读开始', '就读开始时间', '就读时间', '开始时间', '起始时间', 'startdate', 'enrollmentdate'], date: true, read: (c, i) => c.educations[i]?.startDate },
  { key: 'education.endDate', section: 'education', collection: 'educations', aliases: ['毕业时间', '毕业日期', '毕业年月', '预计毕业', '预计毕业时间', '就读结束时间', '结束时间', 'graduationdate', 'expectedgraduation'], date: true, endOfMonth: true, read: (c, i) => c.educations[i]?.endDate },
  { key: 'education.gpa', section: 'education', collection: 'educations', aliases: ['gpa', '绩点', '平均绩点', '平均成绩', '学分绩', 'gradepointaverage'], read: (c, i) => c.educations[i]?.gpa },
  { key: 'education.gpaScale', section: 'education', collection: 'educations', aliases: ['gpa满分', '绩点满分', '满分绩点', 'gpatotal', 'gpascale', 'outof'], read: (c, i) => c.educations[i]?.gpaScale },
  { key: 'education.ranking', section: 'education', collection: 'educations', aliases: ['排名', '专业排名', '年级排名', '全班排名', '成绩排名', '名次', 'ranking', 'rank', 'classrank'], read: (c, i) => c.educations[i]?.ranking },
  { key: 'education.campusRole', section: 'education', collection: 'educations', aliases: ['在校职务', '校内职务', '在校担任职务', 'campusrole'], read: (c, i) => c.educations[i]?.campusRole },
  { key: 'education.lab', section: 'education', collection: 'educations', aliases: ['实验室', '所在实验室', 'laboratory'], read: (c, i) => c.educations[i]?.lab },
  { key: 'education.researchDirection', section: 'education', collection: 'educations', aliases: ['研究方向', '领域方向', '研究领域', 'researchdirection'], read: (c, i) => c.educations[i]?.researchDirection },
  { key: 'education.advisor', section: 'education', collection: 'educations', aliases: ['导师', '指导教师', '指导老师', 'advisor', 'supervisor'], read: (c, i) => c.educations[i]?.advisor },

  // ------------------------------------------------------------------ work
  { key: 'work.company', section: 'work', collection: 'works', aliases: ['公司', '公司名称', '实习公司', '单位', '单位名称', '企业名称', '工作单位', '实习单位', '任职单位', 'company', 'companyname', 'organization', 'employer'], read: (c, i) => c.works[i]?.company },
  { key: 'work.title', section: 'work', collection: 'works', aliases: ['岗位', '职位', '岗位名称', '职位名称', '实习岗位', '担任职务', '任职岗位', '角色', 'position', 'title', 'jobtitle', 'role'], read: (c, i) => c.works[i]?.title },
  { key: 'work.startDate', section: 'work', collection: 'works', aliases: ['实习开始', '实习开始时间', '工作开始', '工作开始时间', '任职开始时间', '入职时间', '入职日期', '开始时间', '起始时间', 'startdate', 'begindate', 'from'], date: true, read: (c, i) => c.works[i]?.startDate },
  { key: 'work.endDate', section: 'work', collection: 'works', aliases: ['实习结束', '实习结束时间', '工作结束', '工作结束时间', '任职结束时间', '离职时间', '离职日期', '结束时间', 'enddate', 'finishdate', 'to'], date: true, endOfMonth: true, read: (c, i) => c.works[i]?.endDate },
  { key: 'work.description', section: 'work', collection: 'works', aliases: ['工作内容', '工作描述', '主要职责', '岗位职责', '工作职责', '实习内容', '核心职责', '职责及业绩', '工作业绩', '工作成果', '描述', 'jobdescription', 'responsibilities', 'duties', 'description'], multiline: true, read: (c, i) => c.works[i]?.description },
  // “无实习经历”是常见的阻断项：不勾选就无法提交，而档案里没有经历时答案本就是确定的。
  { key: 'work.none', section: 'work', aliases: ['没有实习经历', '无实习经历', '暂无实习经历', '没有工作经历', '无工作经历', '暂无工作经历', 'noworkexperience', 'nointernshipexperience'], checkbox: true, skipReason: '档案中存在实习或工作经历，此项不应勾选。', read: c => (c.works.length === 0 ? 'true' : '') },

  // --------------------------------------------------------------- project
  { key: 'project.name', section: 'project', collection: 'projects', aliases: ['项目名称', '项目名', '项目', 'projectname', 'project'], read: (c, i) => c.projects[i]?.name },
  { key: 'project.role', section: 'project', collection: 'projects', aliases: ['项目角色', '担任角色', '项目职位', '项目职务', 'projectrole', 'myrole'], read: (c, i) => c.projects[i]?.role },
  { key: 'project.startDate', section: 'project', collection: 'projects', aliases: ['项目开始', '项目开始时间', '项目开始日期', '项目起始', '项目起始时间', '开始时间', 'startdate', 'from'], date: true, read: (c, i) => c.projects[i]?.startDate },
  { key: 'project.endDate', section: 'project', collection: 'projects', aliases: ['项目结束', '项目结束时间', '项目结束日期', '项目截止时间', '结束时间', 'enddate', 'to'], date: true, endOfMonth: true, read: (c, i) => c.projects[i]?.endDate },
  { key: 'project.description', section: 'project', collection: 'projects', aliases: ['项目描述', '项目内容', '项目职责', '项目成果', '项目详情', '项目介绍', '项目经历描述', '负责内容', '描述', 'projectdescription', 'projectdetails', 'contribution'], multiline: true, read: (c, i) => c.projects[i]?.description },

  // ------------------------------------------------------------------ skills
  { key: 'skills.list', section: 'skills', aliases: ['专业技能', '个人技能', '技能特长', '核心技能', '专业能力', '掌握技能', '技能', 'skills', 'technicalskills'], read: c => c.skills },

  // ------------------------------------------------------------------ campus
  { key: 'campus.name', section: 'campus', collection: 'campus', aliases: ['校园经历名称', '校园经历', '社团名称', '组织名称', '学生工作名称', '活动名称', 'campusname', 'organizationname'], read: (c, i) => c.campus[i]?.name },
  { key: 'campus.role', section: 'campus', collection: 'campus', aliases: ['校园职务', '担任职务', '社团职务', '学生工作职务', 'campusrole'], read: (c, i) => c.campus[i]?.role },
  { key: 'campus.startDate', section: 'campus', collection: 'campus', aliases: ['校园经历开始', '校园经历开始时间', '活动开始时间', '开始时间', 'startdate'], date: true, read: (c, i) => c.campus[i]?.startDate },
  { key: 'campus.endDate', section: 'campus', collection: 'campus', aliases: ['校园经历结束', '校园经历结束时间', '活动结束时间', '结束时间', 'enddate'], date: true, endOfMonth: true, read: (c, i) => c.campus[i]?.endDate },
  { key: 'campus.description', section: 'campus', collection: 'campus', aliases: ['校园经历描述', '活动内容', '校园经历内容', '描述', 'campusdescription'], multiline: true, read: (c, i) => c.campus[i]?.description },

  // ------------------------------------------------------------------ awards
  { key: 'awards.name', section: 'awards', collection: 'awards', aliases: ['奖项名称', '获奖名称', '荣誉名称', '竞赛名称', '所获奖项', '奖项', '获奖', 'awardname', 'honorname', 'prize'], read: (c, i) => c.awards[i]?.name },
  { key: 'awards.detail', section: 'awards', collection: 'awards', aliases: ['奖项描述', '获奖描述', '奖项等级', '奖项级别', '获奖级别', '奖项详情', '描述', 'awardlevel', 'honorlevel'], read: (c, i) => c.awards[i]?.detail },

  // ------------------------------------------------------------ certificates
  { key: 'certificates.name', section: 'certificates', collection: 'certificates', aliases: ['证书名称', '资格证书', '证书', '认证名称', '所获证书', '证书类型', 'certificatename', 'certification', 'certificate'], read: (c, i) => c.certificates[i]?.name },
  { key: 'certificates.detail', section: 'certificates', collection: 'certificates', aliases: ['证书编号', '证书成绩', '证书分数', '证书等级', '发证机构', '颁发机构', '成绩', '分数', '等级', 'certificatescore', 'certificatelevel'], read: (c, i) => c.certificates[i]?.detail },

  // --------------------------------------------------------------- languages
  { key: 'languages.name', section: 'languages', collection: 'languages', aliases: ['语言名称', '语言', '外语', '语种', 'languagename', 'language'], read: (c, i) => c.languages[i]?.name },
  { key: 'languages.detail', section: 'languages', collection: 'languages', aliases: ['语言水平', '外语水平', '外语等级', '语言等级', '语言熟练度', '精通程度', '熟练程度', '掌握程度', '语言成绩', 'proficiency', 'languagelevel'], read: (c, i) => c.languages[i]?.detail },
]

// ------------------------------------------------------------------ helpers

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/** Comparison form: case-, width- and punctuation-insensitive, spaces removed. */
function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_./\\:：,，、;；()（）[\]【】{}<>《》?？*#]+/g, '')
}

function normalizeLabel(value) {
  return normalize(value)
    .replace(/请输入|请选择|请填写|必填|选填|required/gi, '')
}

/**
 * Splits a backend-generated identifier into words, so `name` values can be
 * read rather than matched as one blob: `RecruitmentPortalEducation_StartDate_
 * Month` becomes the words recruitment / portal / education / start / date /
 * month. Frame works render these names, and they say what a control is when
 * the visible label says almost nothing.
 */
function splitIdentifier(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]()]+/g, ' ')
    .toLowerCase()
}

function identifierWords(field) {
  return new Set(splitIdentifier(`${field?.name ?? ''} ${field?.label ?? ''} ${field?.placeholder ?? ''}`)
    .split(' ')
    .filter(Boolean))
}

function hasNonAscii(value) {
  return /[^\x00-\x7F]/.test(value)
}

function ageFromBirthDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(value))
  if (!match) return ''
  const [year, month, day] = match.slice(1).map(Number)
  const birthDate = new Date(year, month - 1, day)
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) return ''
  const today = new Date()
  let age = today.getFullYear() - year
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1
  return age >= 0 && age <= 120 ? String(age) : ''
}

function familyNameOf(fullName) {
  const value = normalizeText(fullName)
  if (!value) return ''
  if (/^[一-鿿]+$/.test(value)) {
    const compound = COMPOUND_SURNAMES.find(surname => value.startsWith(surname))
    return compound ?? value.slice(0, 1)
  }
  return value.split(' ').filter(Boolean).at(-1) ?? ''
}

function givenNameOf(fullName) {
  const value = normalizeText(fullName)
  if (!value) return ''
  if (/^[一-鿿]+$/.test(value)) {
    const compound = COMPOUND_SURNAMES.find(surname => value.startsWith(surname))
    return value.slice(compound ? compound.length : 1)
  }
  return value.split(' ').filter(Boolean).slice(0, -1).join(' ')
}

function parseDateParts(value) {
  const match = normalizeText(value).match(/((?:19|20)\d{2})[^\d]?([01]?\d)?[^\d]?([0-3]?\d)?/)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Math.max(1, Math.min(12, Number(match[2] || 1))),
    day: Math.max(1, Math.min(31, Number(match[3] || 1))),
    hasMonth: Boolean(match[2]),
    hasDay: Boolean(match[3]),
  }
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Formats a saved date for the control that will receive it. Profile dates may
 * be year-only or month-only, so the page's own precision decides the output:
 * a month input gets `YYYY-MM`, a full date input gets a real day (the first for
 * start dates, the last for end dates), and a plain text box keeps whatever the
 * profile stored unless its placeholder asks for more.
 */
function formatDateValue(value, field, rule, datePart = '') {
  const raw = normalizeText(value)
  const parts = parseDateParts(raw)
  if (!parts) return raw
  const day = !parts.hasDay && rule?.endOfMonth ? lastDayOfMonth(parts.year, parts.month) : parts.day
  // One box of a split date takes one component. Unpadded, because these boxes
  // are almost always a select listing plain numbers.
  if (datePart === 'year') return String(parts.year)
  if (datePart === 'month') return String(parts.month)
  if (datePart === 'day') return String(day)
  const inputType = String(field?.inputType ?? '').toLowerCase()
  const hint = normalize(`${field?.placeholder ?? ''} ${field?.label ?? ''}`)
  const full = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const month = `${parts.year}-${String(parts.month).padStart(2, '0')}`

  if (inputType === 'month') return month
  if (inputType === 'date') return full
  if (inputType === 'datetime-local') return `${full}T00:00`
  if (parts.hasDay) return full
  if (/年月日|yyyymmdd|日期|date/.test(hint)) return full
  if (/年月|yyyyMM|month/.test(hint)) return month
  // A control that says nothing about precision gets the value as saved: a
  // fuller date is a claim the profile never made.
  return raw
}

// -------------------------------------------------------------------- table

/** Expands a saved profile into the flat shape the rules read from. */
function buildContext(profile) {
  const root = record(profile)
  const basics = record(root.basics)
  const strategy = record(root.strategy)
  const references = array(root.references).map(record)
  const fromReference = type => references
    .filter(reference => text(reference.type).toUpperCase() === type)
    .map((reference) => ({ ...record(reference.facts), title: reference.title, description: reference.content, content: reference.content }))
  const named = value => array(value).map(item => (typeof item === 'string' ? { name: item } : record(item)))
  const explicitWork = array(root.workExperiences).map(record)
  const explicitProjects = array(root.projects).map(record)

  return {
    basics: {
      fullName: text(basics.fullName),
      gender: text(basics.gender),
      birthDate: text(basics.birthDate),
      phone: text(basics.phone),
      email: text(basics.email),
      documentNumber: text(basics.documentNumber),
      documentType: text(basics.documentType),
      ethnicity: text(basics.ethnicity),
      politicalStatus: text(basics.politicalStatus),
      nativePlace: text(basics.nativePlace),
      householdLocation: text(basics.householdLocation),
      city: text(basics.city),
      countryRegion: text(basics.countryRegion),
      wechatId: text(basics.wechatId),
      maritalStatus: text(basics.maritalStatus),
      heightCm: text(basics.heightCm),
      weightKg: text(basics.weightKg),
      emergencyContactName: text(basics.emergencyContactName),
      emergencyContactRelation: text(basics.emergencyContactRelation),
      emergencyContactPhone: text(basics.emergencyContactPhone),
      targetCities: array(basics.targetCities).map(text).filter(Boolean),
    },
    // Newest degree first, matching `datedItems` on the server: a lone
    // “毕业院校” box means the highest degree, and a repeating education block
    // reads top-down from the most recent record.
    educations: array(root.educations).map(record).sort((left, right) => text(right.endDate).localeCompare(text(left.endDate))),
    works: explicitWork.length ? explicitWork : fromReference('INTERNSHIP'),
    projects: explicitProjects.length ? explicitProjects : fromReference('PROJECT'),
    campus: named(root.campusExperiences).concat(fromReference('CAMPUS')),
    awards: named(root.awards).concat(fromReference('AWARD')),
    certificates: named(root.certificates).concat(fromReference('CERTIFICATE')),
    languages: named(root.languages),
    skills: array(root.skills).map(text).filter(Boolean).join('、'),
    selfEvaluation: savedSelfEvaluation(root),
    targetCity: array(basics.targetCities).map(text).filter(Boolean)[0] ?? array(strategy.targetLocations).map(text).filter(Boolean)[0] ?? '',
    expectedSalary: text(strategy.expectedSalary),
    availableDate: text(strategy.availableDate),
  }
}

/** Self-evaluation lives in the composed blocks, falling back to a legacy key. */
function savedSelfEvaluation(root) {
  const fromBlocks = array(root.blocks)
    .map(record)
    .filter(block => /(?:自我评价|个人评价|个人总结|自我介绍|个人优势)/i.test(text(block.title)))
    .flatMap(block => array(block.fields).map(record))
    .map(field => text(field.text))
    .find(Boolean)
  return fromBlocks ?? text(record(root.basics).selfEvaluation)
}

function recordsFor(context, rule) {
  if (!rule.collection) return null
  return array(context[rule.collection])
}

/** The label used for reporting, mirroring what the page showed the user. */
function fieldLabel(field) {
  return normalizeText(field.label) || normalizeText(field.name) || normalizeText(field.placeholder) || '未命名字段'
}

function fieldIdentityText(field) {
  return [field.label, field.name, field.placeholder].map(normalizeText).filter(Boolean).join(' | ')
}

/** Whether anything at all names this control. */
function hasFieldIdentity(field) {
  return [field.label, field.name, field.placeholder].some(value => normalizeText(value))
}

function signalsFor(field) {
  const visible = [field.label, field.placeholder].map(normalizeLabel).filter(Boolean)
  const attributes = [field.name].map(normalize).filter(Boolean)
  return { visible, attributes }
}

/**
 * The field's own wording only — never the surrounding page text. A veto has to
 * be about what the box itself says: a neighbour named “学校名称” must not turn
 * a genuine “开始时间” box into a rejected date.
 */
function descriptorFor(field) {
  return normalize(`${field.label ?? ''} ${field.placeholder ?? ''} ${field.name ?? ''}`)
}

function contextTextFor(field) {
  return normalize(field.context)
}

function detectSectionFromText(value) {
  if (!value) return null
  for (const [section, pattern] of SECTION_HINTS) {
    if (pattern.test(value)) return section
  }
  return null
}

/** The block named by the field's own identifier words, if any. */
function sectionFromIdentifier(field) {
  const words = identifierWords(field)
  if (!words.size) return null
  for (const [section, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.some(alias => words.has(alias))) return section
  }
  return null
}

/**
 * Infers the block a field belongs to. The field's own wording wins first, so a
 * “姓名” box inside an internship card is still basic; free-text wording wins
 * second, because locking a self-summary to a section would block both the
 * generic “描述” rules and the self-evaluation rule.
 */
function inferSection(field, signals) {
  const own = normalize(`${signals.visible.join(' ')} ${signals.attributes.join(' ')}`)
  if (FREE_TEXT_OWN_WORDS.test(own)) return null
  if (BASIC_OWN_WORDS.test(own)) return 'basic'
  return sectionFromIdentifier(field)
    ?? detectSectionFromText(own)
    ?? detectSectionFromText(contextTextFor(field))
}

const DATE_ROLE_WORDS = {
  end: ['end', 'finish', 'until'],
  start: ['start', 'begin', 'from', 'since'],
}

/** Which end of a date range a control holds. */
function dateRoleOf(field) {
  const words = identifierWords(field)
  for (const [role, candidates] of Object.entries(DATE_ROLE_WORDS)) {
    if (candidates.some(candidate => words.has(candidate))) return role
  }
  const text = normalize(`${field?.label ?? ''} ${field?.name ?? ''} ${field?.placeholder ?? ''}`)
  if (/结束|截止|离职|毕业/.test(text)) return 'end'
  if (/开始|起始|入学|入职|起止/.test(text)) return 'start'
  return ''
}

/**
 * Which component of a date a control holds, when the date is split across
 * several boxes. Both a name that says so and the unit character written beside
 * the box are read; a unit alone is only trusted for a control that also says
 * which end of the range it is, so “工作年限 ___ 年” is not a year component.
 */
function datePartOf(field) {
  // Read from the name only. A placeholder like `YYYY-MM-DD` names every
  // component at once — it is a format hint for one full-date box, not evidence
  // that the date is split.
  const words = new Set(splitIdentifier(field?.name ?? '').split(' ').filter(Boolean))
  if (words.has('year') || words.has('yyyy')) return 'year'
  if (words.has('month')) return 'month'
  if (words.has('day')) return 'day'
  const unit = String(field?.dateUnit ?? '')
  if (['year', 'month', 'day'].includes(unit) && dateRoleOf(field)) return unit
  return ''
}

function contextSections(field) {
  const context = contextTextFor(field)
  if (!context) return []
  return Object.entries(SECTION_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => context.includes(normalize(alias))))
    .map(([section]) => section)
}

/** Structural vetoes: the control itself rules the rule out. */
function isControlCompatible(rule, field) {
  const inputType = String(field?.inputType ?? '').toLowerCase()
  const controlType = String(field?.controlType ?? '').toLowerCase()
  if (rule.checkbox) return inputType === 'checkbox'
  if (inputType === 'checkbox') return false
  if (['date', 'month', 'datetime-local', 'week', 'time'].includes(inputType) && !rule.date) return false
  // Short facts do not belong in a big free-text box; narrative rules do.
  if (controlType === 'textarea' && !rule.multiline && !rule.date) return false
  return true
}

/**
 * Semantic vetoes for the confusions that cost the most: a pinyin box is not a
 * name, a company-type dropdown is not a company, a country-code picker is not
 * a phone number, and a date box never holds an entity name (or the reverse).
 */
function isDescriptorCompatible(rule, field, descriptor) {
  if (!descriptor) return true
  // A number of application forms render one shared “个人证件” label above two
  // controls: the picker chooses the document type, the text box beside it holds
  // the number. Split them by control shape before the label can decide.
  if (/^(?:个人证件|证件信息|document)$/.test(normalize(field?.label))) {
    const isOptionControl = ['select', 'radio-group', 'custom-select'].includes(String(field?.controlType ?? '').toLowerCase())
    if (rule.key === 'basics.documentType') return isOptionControl
    if (rule.key === 'basics.documentNumber') return !isOptionControl
  }
  if (rule.key === 'basics.fullName' && /拼音|pinyin|英文名|英文姓名|englishname|firstname|lastname|givenname|familyname|surname/.test(descriptor)) return false
  if (rule.key === 'basics.phone' && /国家地区|国家代码|区号|country|callingcode|areacode/.test(descriptor)) return false
  if (rule.key === 'work.company' && /公司类型|公司性质|公司规模|所在行业|行业类型|companytype|industry/.test(descriptor)) return false
  if (rule.date && /学校名称|院校名称|专业名称|学历|公司名称|职位名称|项目名称|项目角色|证书名称/.test(descriptor)) return false
  if (!rule.date
    && ['education.school', 'education.major', 'education.educationLevel', 'work.company', 'work.title', 'project.name', 'project.role'].includes(rule.key)
    && /起止时间|就读时间|入学时间|毕业时间|开始时间|结束时间|日期|年月/.test(descriptor)) return false
  return true
}

function matchScore(rule, signals, sectionHint) {
  let score = 0
  for (const alias of rule.aliases) {
    const normalized = normalize(alias)
    if (!normalized) continue
    // A generic alias only disambiguates when the section is already known.
    if (GENERIC_ALIASES.has(normalized) && (!sectionHint || rule.section !== sectionHint)) continue
    for (const signal of signals.visible) {
      if (signal === normalized) score = Math.max(score, 0.99)
      else if (signal.includes(normalized) && normalized.length >= 2) score = Math.max(score, 0.91)
      else if (normalized.includes(signal) && signal.length >= 4) score = Math.max(score, 0.8)
    }
    for (const signal of signals.attributes) {
      if (signal === normalized) score = Math.max(score, 0.9)
      else if (signal.includes(normalized) && normalized.length >= (hasNonAscii(normalized) ? 2 : 5)) score = Math.max(score, 0.78)
      else if (normalized.includes(signal) && signal.length >= 5) score = Math.max(score, 0.7)
    }
  }
  return score
}

function scoreRule(rule, field, signals, sectionHint, descriptor, sections) {
  const score = matchScore(rule, signals, sectionHint)
  if (score === 0) return 0
  if (!isControlCompatible(rule, field)) return 0
  if (!isDescriptorCompatible(rule, field, descriptor)) return 0

  let total = score
  const inputType = String(field?.inputType ?? '').toLowerCase()
  const controlType = String(field?.controlType ?? '').toLowerCase()

  if (sectionHint && rule.section !== sectionHint) {
    // Dates are the ambiguous case: “开始时间” appears in every block, so an
    // exact label alone is not enough to move one across sections. Everything
    // else may cross when the label matches exactly, which is how a stray
    // “学校名称” box inside a work block still reads the education record.
    if (rule.date || score < 0.99) return 0
  }
  if (sections.includes(rule.section)) total += 0.08
  if (sectionHint === rule.section) total += 0.08
  if (array(rule.types).includes(inputType) && score >= 0.65) total += 0.08
  if (rule.multiline && controlType === 'textarea') total += 0.06
  if (rule.date && signals.visible.some(signal => /日期|时间|年月|date|month|year/.test(signal))) total += 0.05
  if (rule.checkbox && inputType === 'checkbox') total += 0.08
  return Math.max(0, Math.min(total, 1))
}

function bestRuleFor(field) {
  const signals = signalsFor(field)

  // A date split across boxes is read by component, which also decides which
  // end of the range it belongs to. This runs before scoring because the
  // component is what the value has to be, and no full-date rule can supply it.
  const part = datePartOf(field)
  if (part) {
    const section = inferSection(field, signals)
    const role = dateRoleOf(field)
    const rule = section && role ? RULES.find(item => item.key === `${section}.${role}Date`) : null
    return { rule: rule ?? null, score: rule ? 1 : 0, datePart: part }
  }

  const sectionHint = inferSection(field, signals)
  const descriptor = descriptorFor(field)
  const sections = contextSections(field)
  let best = null
  for (const rule of RULES) {
    const score = scoreRule(rule, field, signals, sectionHint, descriptor, sections)
    if (score > SCORE_THRESHOLD && (!best || score > best.score)) best = { rule, score }
  }
  return best
}

// ------------------------------------------------------------- option match

function optionAliases(value) {
  const wanted = normalizeLabel(value)
  if (!wanted) return []
  const entry = OPTION_ALIASES.find(([key]) => normalizeLabel(key) === wanted)
  return entry ? entry[1].map(normalizeLabel) : [wanted]
}

/**
 * Picks the single option a saved value refers to. Anything ambiguous returns
 * `null`: a wrong dropdown answer is worse than a blank one.
 */
function chooseOption(value, options) {
  const wanted = normalizeLabel(value)
  // Search the normalized form but always hand back the page's own text, which
  // is what the page-side lookup matches against.
  const available = options.map(option => ({ raw: option, key: normalizeLabel(option) })).filter(option => option.key)
  if (!wanted || !available.length) return null

  const exact = available.filter(option => option.key === wanted)
  if (exact.length === 1) return exact[0].raw

  const aliases = optionAliases(value)
  const byAlias = available.filter(option => aliases.includes(option.key))
  if (byAlias.length === 1) return byAlias[0].raw

  const relaxed = wanted.replace(/[省市]$/, '')
  const byRelaxed = available.filter(option => option.key.replace(/[省市]$/, '') === relaxed)
  if (byRelaxed.length === 1) return byRelaxed[0].raw

  const byContainment = available.filter(option => option.key.includes(wanted) || wanted.includes(option.key))
  if (byContainment.length === 1) return byContainment[0].raw

  return null
}

function isOptionControl(controlType) {
  return controlType === 'select' || controlType === 'radio-group'
}

/** Returns the option text to write, `undefined` when the control has no list. */
function resolveOptionValue(value, field) {
  const controlType = String(field?.controlType ?? '').toLowerCase()
  if (!isOptionControl(controlType)) return { value }
  const options = array(field.options).map(normalizeText).filter(Boolean)
  if (!options.length) return controlType === 'select' ? { error: '下拉选项为空，无法确认唯一选项。' } : { value }
  const chosen = chooseOption(value, options)
  if (!chosen) return { error: '下拉选项不存在可确认的唯一匹配，需要人工确认。' }
  return { value: chosen }
}

// ------------------------------------------------------------- record index

/**
 * Walks each repeating section in page order. A field that names its record
 * (“学校名称”, “公司名称”) advances the record counter; the fields below it
 * inherit that record until the next heading appears. Sections whose page
 * blocks carry no such heading fall back to counting occurrences of each rule.
 */
function assignRecordIndices(candidates) {
  for (const section of REPEATABLE_SECTIONS) {
    const group = candidates.filter(candidate => candidate.rule.section === section)
    if (!group.length) continue
    const anchorKey = ANCHOR_KEYS[section]
    const hasAnchor = group.some(candidate => candidate.rule.key === anchorKey)

    if (hasAnchor) {
      let current = -1
      for (const candidate of group) {
        if (candidate.rule.key === anchorKey) current += 1
        candidate.anchorIndex = Math.max(0, current)
      }
    }

    // The year and month boxes of one range are one record, so they must not
    // each consume an occurrence. When the page shows no anchor heading to
    // group by, their own sequence does: a record ends when a component
    // repeats (“StartDate_Year” after we have already seen one).
    const seenParts = new Set()
    let dateRecord = 0
    for (const candidate of group) {
      if (!candidate.datePart) continue
      const partKey = `${candidate.rule.key}:${candidate.datePart}`
      if (seenParts.has(partKey)) {
        dateRecord += 1
        seenParts.clear()
      }
      seenParts.add(partKey)
      candidate.datePartIndex = dateRecord
    }

    const occurrences = new Map()
    for (const candidate of group) {
      const seen = occurrences.get(candidate.rule.key) ?? 0
      occurrences.set(candidate.rule.key, seen + 1)
      candidate.occurrenceIndex = seen
    }
  }
}

/**
 * Picks the saved record a repeating field reads, preferring the heading-derived
 * index so every field of one page block reads one record. A page that groups
 * its blocks by field rather than by record (“all the description boxes
 * together”) can hand several fields the same heading index, so the field's own
 * occurrence order is tried next, then any record nobody has claimed yet.
 *
 * Reading a record is better than leaving the box blank here because the report
 * names the record that was used and nothing is ever submitted automatically.
 * Returns `null` only when the page repeats more blocks than the profile holds.
 */
/** The claim a field takes on a record — its date component counts as part of it. */
function claimKey(candidate, index) {
  return `${candidate.rule.key}#${index}${candidate.datePart ? `#${candidate.datePart}` : ''}`
}

function resolveRecordIndex(candidate, records, claimed) {
  const usable = index => Number.isInteger(index) && index >= 0 && index < records.length
  // A date component is placed by the block it sits in, or by the part cycle;
  // plain occurrence counting would hand the month box the next record.
  const candidates = (candidate.datePart
    ? [candidate.anchorIndex, candidate.datePartIndex]
    : [candidate.anchorIndex, candidate.occurrenceIndex]).filter(usable)
  for (const index of candidates) {
    if (!claimed.has(claimKey(candidate, index))) return index
  }
  // Falling back to a record another field already read would repeat one
  // education in two page blocks; better to report the block as unfilled.
  for (let index = 0; index < records.length; index += 1) {
    if (!claimed.has(claimKey(candidate, index))) return index
  }
  return null
}

// ------------------------------------------------------------------- public

function isSensitive(field) {
  const identity = fieldIdentityText(field)
  return ['password', 'file'].includes(String(field.inputType ?? '').toLowerCase())
    || SENSITIVE_PATTERNS.filter((_, index) => index !== EXEMPT_SENSITIVE_PATTERN_INDEX).some(pattern => pattern.test(identity))
}

export function classifyField(field) {
  const identity = fieldIdentityText(field)
  if (isSensitive(field)) return 'sensitive'
  const match = bestRuleFor(field)
  // `rule` is null for a date component that could not be placed in a block.
  if (match?.rule) return match.rule.section
  const inputType = String(field?.inputType ?? '').toLowerCase()
  if (['date', 'datetime-local', 'month', 'week', 'time'].includes(inputType) || /(?:日期|时间|date|time)/i.test(identity)) return 'date'
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(identity))?.[0] ?? 'unknown'
}

function baseEntry(field, category, status, reason, extra = {}) {
  return {
    fieldId: normalizeText(field.id),
    label: fieldLabel(field),
    category,
    status,
    reason,
    ...extra,
  }
}

function needsManual(field, category, reason, target) {
  return baseEntry(field, category, 'needs_manual', reason, target ? { target } : {})
}

/**
 * Builds a report and no-DOM fill plan from safe field metadata.
 *
 * The plan covers nine profile sections so that most of a form is answered from
 * saved data before the AI fallback is asked for anything.
 *
 * @param {object} profile
 * @param {Array<object>} fields
 */
export function buildFillPlan(profile, fields) {
  const context = buildContext(profile)
  const descriptors = array(fields).map(candidate => (candidate && typeof candidate === 'object' ? candidate : {}))

  // Pass 1: decide what each field is before any record index exists.
  const decisions = new Map()
  const candidates = []
  for (const field of descriptors) {
    if (!normalizeText(field.id)) {
      decisions.set(field, { entry: baseEntry(field, 'unknown', 'needs_manual', '字段缺少稳定标识，无法安全填写。') })
      continue
    }
    // A control whose only label was a unit character or a range separator has
    // no identity left once that is filtered out. Nothing can decide what goes
    // in it, and handing it to a model turns an unfillable box into an invented
    // one — a separator box that comes back with a value in it.
    if (!hasFieldIdentity(field)) {
      decisions.set(field, { entry: { ...needsManual(field, 'unlabeled', '这个控件没有任何可识别的标签，无法判断它该填什么。'), skipAi: true } })
      continue
    }
    const category = classifyField(field)
    if (category === 'sensitive') {
      decisions.set(field, { entry: baseEntry(field, category, 'skipped_sensitive', '敏感字段或上传控件不会填写。') })
      continue
    }
    if (field.hasValue === true) {
      decisions.set(field, { entry: baseEntry(field, category, 'skipped_existing', '字段已有内容，不会覆盖。') })
      continue
    }
    if (field.isEditable === false) {
      decisions.set(field, { entry: needsManual(field, category, '字段当前不可编辑。') })
      continue
    }
    const match = bestRuleFor(field)
    if (!match?.rule) {
      if (match?.datePart) {
        // One component of a split date with no block to read from. Handing it
        // to a model gets a whole date written into a year box, so it is named
        // as what it is and left alone.
        decisions.set(field, {
          entry: { ...needsManual(field, 'date', '这是日期的一部分，但无法确定它属于哪一段档案记录。'), skipAi: true },
        })
        continue
      }
      decisions.set(field, {
        entry: needsManual(field, category, category === 'unknown' ? '字段含义无法可靠确认。' : '字段未匹配到档案中的可用栏目。'),
      })
      continue
    }
    candidates.push({ field, rule: match.rule, score: match.score, datePart: match.datePart })
  }

  // Pass 2: map repeating page blocks onto saved records, in page order.
  assignRecordIndices(candidates)

  // Pass 3: resolve values and emit one entry per field, in page order.
  const candidateByField = new Map(candidates.map(candidate => [candidate.field, candidate]))
  const claimed = new Map()
  const entries = descriptors.map((field) => {
    const decided = decisions.get(field)
    if (decided) return decided.entry

    const candidate = candidateByField.get(field)
    const { rule } = candidate
    const category = rule.section
    const isRepeatable = Boolean(rule.collection)
    let recordIndex = 0
    if (isRepeatable) {
      const records = recordsFor(context, rule) ?? []
      recordIndex = resolveRecordIndex(candidate, records, claimed)
      if (recordIndex === null) {
        // The profile documents this section and every record is spoken for, so
        // this block asks for an entry that does not exist. The model has
        // nothing to draw on and would invent one — a third degree for someone
        // who has two — so it is not asked.
        if (records.length > 0) {
          return {
            ...needsManual(field, category, '页面中的重复区块多于档案中的记录条数，此字段需要人工确认。', rule.key),
            skipAi: true,
          }
        }
        // The section is absent from the profile altogether. We know nothing
        // about this part of the applicant's history, so the resume in the
        // model's evidence remains the only source and it is still asked.
        return needsManual(field, category, '所选资料档案没有该字段的可用内容。', rule.key)
      }
    }
    // A date component claims its record together with its siblings, so the
    // component belongs in the key: the year box and the month box of one
    // record are not two boxes asking the same question.
    const dedupeKey = isRepeatable ? claimKey(candidate, recordIndex) : rule.key
    // Only single-valued rules need this: a page with two “姓名” boxes gives no
    // way to tell which one the saved name belongs to.
    if (!isRepeatable && claimed.has(dedupeKey)) {
      return needsManual(field, category, '页面已存在同一档案栏目的另一个字段，此字段需要人工确认。', rule.key)
    }

    const rawValue = text(rule.read(context, recordIndex))
    if (!rawValue) {
      const reason = rule.skipReason
        ?? (isRepeatable && recordIndex > 0
          ? `档案中没有第 ${recordIndex + 1} 条对应记录。`
          : '所选资料档案没有该字段的可用内容。')
      return needsManual(field, category, reason, rule.key)
    }
    const value = rule.date ? formatDateValue(rawValue, field, rule, candidate.datePart) : rawValue
    if (!value) return needsManual(field, category, '档案中的日期无法解析。', rule.key)

    const resolved = resolveOptionValue(value, field)
    if (resolved.error) return needsManual(field, category, resolved.error, rule.key)

    claimed.set(dedupeKey, field)
    return baseEntry(field, category, 'filled', describeRule(rule, recordIndex), {
      target: rule.key,
      // Which saved record this page block reads. Callers use it to keep the
      // fields of one record in the same AI batch, so a description is never
      // answered from another internship's facts.
      record: isRepeatable ? recordIndex : undefined,
      value: resolved.value,
      derived: rule.derived === true || undefined,
    })
  })

  return {
    entries,
    summary: entries.reduce((summary, entry) => {
      summary[entry.status] += 1
      return summary
    }, { filled: 0, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 }),
  }
}

function describeRule(rule, recordIndex) {
  if (rule.derived) return '由档案中的出生日期推导。'
  if (rule.collection && recordIndex > 0) return `按页面顺序对应到档案中的第 ${recordIndex + 1} 条记录。`
  return '标签与档案栏目匹配。'
}

/** Reconciles the just-in-time page-side result without exposing page values. */
export function reconcileFillOutcome(plan, outcome) {
  const applied = new Set(outcome?.appliedIds ?? [])
  const existing = new Set(outcome?.skippedExistingIds ?? [])
  const unavailable = new Set(outcome?.unavailableIds ?? [])
  const entries = (plan?.entries ?? []).map((entry) => {
    const { value: _value, ...reportEntry } = entry
    if (entry.status !== 'filled') return reportEntry
    if (applied.has(entry.fieldId)) return reportEntry
    if (existing.has(entry.fieldId)) return { ...reportEntry, status: 'skipped_existing', reason: '字段在填写前已有内容，不会覆盖。' }
    if (unavailable.has(entry.fieldId)) return { ...reportEntry, status: 'needs_manual', reason: '字段在填写时不可用或已变化。' }
    return { ...reportEntry, status: 'needs_manual', reason: '字段未能可靠填写，请人工处理。' }
  })
  return {
    entries,
    summary: entries.reduce((summary, entry) => {
      summary[entry.status] += 1
      return summary
    }, { filled: 0, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 }),
  }
}
