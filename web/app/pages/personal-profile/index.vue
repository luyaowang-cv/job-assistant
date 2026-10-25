<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type FamilyMember = {
  name: string
  relation: string
  organization: string
  role: string
  phone: string
  age: number | undefined
  politicalStatus: string
  nativePlace: string
}
/** 政治面貌选项。服务端只校验长度不硬枚举（网申表单的写法五花八门），选项是界面约束。 */
const politicalStatusOptions = ['中共党员', '中共预备党员', '共青团员', '群众', '民主党派', '其他']
/** 家庭成员的「关系」。常见就这几种，但现实中还有祖父/岳父这类，所以保留 allow-create。 */
const relationOptions = ['父亲', '母亲', '配偶', '子女', '兄弟姐妹', '其他']
/**
 * 下拉的意义不只是"好看"：自由填写会出现「汉」「汉族」「汉 族」三种写法，
 * 而目标网站的选项通常只有一个。存标准词，插件才更容易命中。
 * 民族给常见项 + allow-create，其余民族自己输入。
 */
const ethnicityOptions = ['汉族', '满族', '回族', '蒙古族', '壮族', '维吾尔族', '藏族', '苗族', '彝族', '布依族', '朝鲜族', '侗族', '瑶族', '白族', '土家族', '哈尼族', '哈萨克族', '傣族', '黎族', '其他']
const documentTypeOptions = ['居民身份证', '护照', '港澳居民来往内地通行证', '台湾居民来往大陆通行证', '外国人永久居留身份证', '其他']
const householdTypeOptions = ['城镇', '农村', '其他']
const healthStatusOptions = ['健康', '良好', '一般', '需关注']

type Basics = {
  fullName: string, countryRegion: string, gender: string, email: string, birthDate: string, wechatId: string, documentType: string, documentNumber: string,
  phone: string, politicalStatus: string, city: string, ethnicity: string,
  // 籍贯 / 生源地 / 户籍所在地 是三件事，网申表单常常分开问
  nativePlace: string, originPlace: string, householdLocation: string, householdType: string,
  healthStatus: string, specialty: string, hobbies: string,
  heightCm: number | undefined, weightKg: number | undefined,
  maritalStatus: string, emergencyContactName: string, emergencyContactRelation: string, emergencyContactPhone: string,
}

const empty = () => ({
  basics: {
    fullName: '', countryRegion: '中国', gender: '', email: '', birthDate: '', wechatId: '', documentType: '居民身份证', documentNumber: '', phone: '', politicalStatus: '', city: '',
    ethnicity: '', nativePlace: '', originPlace: '', householdLocation: '', householdType: '', healthStatus: '', specialty: '', hobbies: '',
    heightCm: undefined, weightKg: undefined, maritalStatus: '', emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
  } as Basics,
  familyMembers: [] as FamilyMember[],
})
const profile = reactive(empty())
const loading = ref(false)
const saving = ref(false)
const emptyFamilyMember = (): FamilyMember => ({ name: '', relation: '', organization: '', role: '', phone: '', age: undefined, politicalStatus: '', nativePlace: '' })

function assign(data?: Partial<ReturnType<typeof empty>>) {
  // Keep Vue's reactive nested object stable. Replacing profile.basics during a
  // reload can leave inputs bound to the previous proxy and appear blank.
  Object.assign(profile.basics, empty().basics, data?.basics ?? {})
  profile.familyMembers.splice(0, profile.familyMembers.length, ...(data?.familyMembers ?? []).map(item => ({ ...emptyFamilyMember(), ...item })))
}
const cleanEntry = (entry: Record<string, unknown>) => Object.fromEntries(Object.entries(entry).filter(([, value]) => {
  if (typeof value === 'string') return Boolean(value.trim())
  return typeof value === 'number' && Number.isFinite(value)
}))
function payload() {
  // 不带 educations：教育已迁成素材卡，服务端收到缺省字段时不会覆盖库里的历史值。
  // basics 现在只剩标量字段（没有数组了），cleanEntry 顺手丢掉空串和 undefined 就够。
  return {
    basics: cleanEntry({ ...profile.basics }),
    // 家庭成员是页面在编辑的数据块，整块提交；全空的行直接丢掉，避免存一堆空对象
    familyMembers: profile.familyMembers
      .filter(item => item.name.trim() || item.relation.trim())
      .map(item => cleanEntry({ ...item })),
  }
}
async function load() {
  loading.value = true
  try { const response = await $fetch<{ data: Partial<ReturnType<typeof empty>> | null }>('/api/v1/personal-profile'); assign(response.data ?? undefined) }
  catch { ElMessage.error('个人主档案读取失败。') }
  finally { loading.value = false }
}
async function save() {
  saving.value = true
  try { await $fetch('/api/v1/personal-profile', { method: 'PUT', body: payload() }); ElMessage.success('个人主档案已保存；网申档案会自动继承这些固定信息。') }
  catch { ElMessage.error('保存失败，请检查邮箱、手机号和日期格式。') }
  finally { saving.value = false }
}
async function removeFamilyMember(index: number) {
  try {
    await ElMessageBox.confirm('删除后，这位家庭成员将不会随个人档案保存。确定删除吗？', '删除家庭成员', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    profile.familyMembers.splice(index, 1)
    ElMessage.success('已删除，保存后生效。')
  }
  catch {
    // 用户主动取消，不需要提示
  }
}
onMounted(() => { void load() })
</script>

<template>
  <section v-loading="loading" class="page-rail page-rail--narrow material-page pb-24">
    <div class="material-surface material-surface--transparent">
      <div class="material-section-label mb-5 mt-2 text-sm text-slate-500">个人信息</div>
      <div class="profile-form-grid personal-profile-fields">
        <el-form-item label="姓名"><el-input v-model="profile.basics.fullName" /></el-form-item>
        <el-form-item label="性别"><el-input v-model="profile.basics.gender" /></el-form-item>
        <el-form-item label="出生日期"><el-date-picker v-model="profile.basics.birthDate" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
        <el-form-item label="国籍/地区"><el-input v-model="profile.basics.countryRegion" /></el-form-item>
        <el-form-item label="民族"><el-select v-model="profile.basics.ethnicity" class="w-full" filterable allow-create clearable placeholder="选择或输入"><el-option v-for="option in ethnicityOptions" :key="option" :label="option" :value="option" /></el-select></el-form-item>
        <el-form-item label="政治面貌"><el-select v-model="profile.basics.politicalStatus" class="w-full" allow-create clearable placeholder="选择"><el-option v-for="option in politicalStatusOptions" :key="option" :label="option" :value="option" /></el-select></el-form-item>
        <el-form-item label="籍贯"><el-input v-model="profile.basics.nativePlace" placeholder="精确到区（县）" /></el-form-item>
        <el-form-item label="生源地"><el-input v-model="profile.basics.originPlace" placeholder="精确到区（县）" /></el-form-item>
        <el-form-item label="户口所在地"><el-input v-model="profile.basics.householdLocation" placeholder="精确到区（县）" /></el-form-item>
        <el-form-item label="户籍类型"><el-select v-model="profile.basics.householdType" class="w-full" clearable placeholder="选择"><el-option v-for="option in householdTypeOptions" :key="option" :label="option" :value="option" /></el-select></el-form-item>
        <el-form-item label="婚姻状况"><el-input v-model="profile.basics.maritalStatus" placeholder="未婚 / 已婚" /></el-form-item>
        <el-form-item label="健康状况"><el-select v-model="profile.basics.healthStatus" class="w-full" allow-create clearable placeholder="选择"><el-option v-for="option in healthStatusOptions" :key="option" :label="option" :value="option" /></el-select></el-form-item>
        <el-form-item label="身高（cm）"><el-input-number v-model="profile.basics.heightCm" class="w-full" :min="30" :max="300" controls-position="right" /></el-form-item>
        <el-form-item label="体重（kg）"><el-input-number v-model="profile.basics.weightKg" class="w-full" :min="1" :max="500" :precision="1" controls-position="right" /></el-form-item>
        <el-form-item label="所在地"><el-input v-model="profile.basics.city" /></el-form-item>
        <el-form-item label="移动电话"><el-input v-model="profile.basics.phone" /></el-form-item>
        <el-form-item label="电子邮箱"><el-input v-model="profile.basics.email" /></el-form-item>
        <el-form-item label="微信号"><el-input v-model="profile.basics.wechatId" /></el-form-item>
        <el-form-item label="证件类型"><el-select v-model="profile.basics.documentType" class="w-full" clearable placeholder="选择"><el-option v-for="option in documentTypeOptions" :key="option" :label="option" :value="option" /></el-select></el-form-item>
        <!-- 标签跟着证件类型变：填护照时写「身份证号」就不对了。也不做密码遮罩——
             遮起来就看不到自己填错没有，而这一栏经常要核对。
             跟在证件类型后面、不跨行：它会自己填进那一行剩下的格子（证件类型和号码本来就该挨着）。 -->
        <el-form-item :label="profile.basics.documentType === '居民身份证' ? '身份证号' : '证件号码'"><el-input v-model="profile.basics.documentNumber" placeholder="仅本地保存，不会发送给 AI" /></el-form-item>
        <el-form-item class="profile-form-item--span2 profile-form-item--tall" label="特长"><el-input v-model="profile.basics.specialty" type="textarea" :rows="2" resize="none" /></el-form-item>
        <el-form-item class="profile-form-item--span2 profile-form-item--tall" label="兴趣爱好"><el-input v-model="profile.basics.hobbies" type="textarea" :rows="2" resize="none" /></el-form-item>
        <el-form-item label="紧急联系人姓名"><el-input v-model="profile.basics.emergencyContactName" /></el-form-item>
        <el-form-item label="紧急联系人关系"><el-input v-model="profile.basics.emergencyContactRelation" /></el-form-item>
        <el-form-item label="紧急联系人电话"><el-input v-model="profile.basics.emergencyContactPhone" /></el-form-item>
      </div>
      <section class="personal-profile__family">
        <div class="material-section-label">家庭成员</div>
        <div v-for="(item, index) in profile.familyMembers" :key="index" class="family-member-item">
          <el-input v-model="item.name" placeholder="姓名" />
          <el-select v-model="item.relation" class="w-full" filterable allow-create clearable placeholder="关系">
            <el-option v-for="option in relationOptions" :key="option" :label="option" :value="option" />
          </el-select>
          <el-input v-model="item.organization" placeholder="工作单位" />
          <el-input v-model="item.role" placeholder="职务 / 职业" />
          <el-input v-model="item.phone" placeholder="联系电话" />
          <el-input-number v-model="item.age" class="w-full" :min="0" :max="150" :precision="0" controls-position="right" placeholder="年龄" />
          <el-select v-model="item.politicalStatus" class="w-full" clearable placeholder="政治面貌">
            <el-option v-for="option in politicalStatusOptions" :key="option" :label="option" :value="option" />
          </el-select>
          <el-input v-model="item.nativePlace" placeholder="籍贯" />
          <div class="family-member-item__actions"><el-button plain type="danger" @click="removeFamilyMember(index)">删除该成员</el-button></div>
        </div>
        <div class="personal-profile__family-actions"><el-button plain @click="profile.familyMembers.push(emptyFamilyMember())">新增家庭成员</el-button></div>
      </section>
      <div class="personal-profile__save"><el-button type="primary" size="large" :loading="saving" @click="save">保存个人主档案</el-button></div>
    </div>
  </section>
</template>
