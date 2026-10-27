import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Settings2, Pencil, Trash2, Package, X } from 'lucide-react'
import { useSettings, calculatePrice } from '../context/SettingsContext'
import { formatCurrency } from '../utils/format'
import ModalFrame from '../components/UI/ModalFrame'
import api from '../api/client'
import './PartsCatalog.css'

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
const catalogKey = value => String(value || '').trim().toLocaleLowerCase('pt-BR')
const labels = { category: 'Categorias', brand: 'Marcas', quality: 'Qualidades', model: 'Modelos' }
const emptyPart = { category_id: '', brand: '', model: '', version: '', quality_id: '', description: '', part_code: '', assembly_type: '', frame: '', cost_price: '', sale_price: '' }
const errorText = e => e.response?.data?.error || 'Não foi possível concluir. Tente novamente.'

export default function FrontalsCalculator() {
  const { settings: { finance } } = useSettings()
  const [data, setData] = useState({ entries: [], options: [], models: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState(null)
  const [manager, setManager] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  async function load() {
    const response = await api.get('/calculators/parts')
    setEditing(current => {
      if (!current) return current
      const previous = data.models?.find(m => catalogKey(m.brand) === catalogKey(current.brand) && catalogKey(m.name) === catalogKey(current.model))
      const updated = response.data.models?.find(m => m.id === previous?.id)
      return updated ? { ...current, brand: updated.brand, model: updated.name } : current
    })
    setData(response.data)
  }
  useEffect(() => { load().catch(e => setError(errorText(e))).finally(() => setLoading(false)) }, [])
  const options = kind => data.options.filter(o => o.kind === kind)
  const categories = options('category')
  const selectedModel = editing && data.models?.find(m => catalogKey(m.brand) === catalogKey(editing.brand) && catalogKey(m.name) === catalogKey(editing.model))
  const filtered = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean)
    return data.entries.filter(p => (!category || p.category_id === Number(category)) && terms.every(term => normalize([p.category || 'Frontais', p.brand, p.model, p.version, p.quality, p.description, p.part_code, p.assembly_type, p.frame === 'with' ? 'com aro' : p.frame === 'without' ? 'sem aro' : ''].join(' ')).includes(term)))
  }, [data.entries, category, query])
  async function mutate(action, success, close) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await action()
      close?.()
      setNotice(success)
      try { await load() } catch { setError('Alteração salva. Não foi possível atualizar a lista; clique em Recarregar.') }
    } catch(e) { setError(errorText(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  const begin = () => { setError(''); setEditing({ ...emptyPart, category_id: category || categories[0]?.id || '', brand: options('brand')[0]?.name || '' }) }
  const groups = [...new Set(filtered.map(p => p.category_id))].map(id => ({ id, name: categories.find(c => c.id === id)?.name || 'Frontais', rows: filtered.filter(p => p.category_id === id) }))
  return <div className="parts-page space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-display font-bold text-xl">Valor de Peças</h2><p className="text-sm text-slate-400 mt-1">Consulte preços e organize as peças por categoria.</p></div>
      <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => { setError(''); setManager('category') }}><Settings2 size={16}/>Gerenciar</button><button className="btn-primary" disabled={loading} onClick={begin}><Plus size={16}/>Adicionar peça</button></div>
    </header>
    {error && !editing && !manager && !removing && <p role="alert" className="text-rose-500">{error} <button className="underline" onClick={() => { setError(''); load().catch(e=>setError(errorText(e))) }}>Recarregar</button></p>}
    {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="relative"><Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input aria-label="Pesquisar peça, marca ou modelo" className="input w-full pl-11 pr-12 py-3" placeholder="Pesquisar peça, marca ou modelo..." value={query} onChange={e=>setQuery(e.target.value)}/>{query && <button aria-label="Limpar pesquisa" className="absolute right-3 top-1/2 -translate-y-1/2 p-1" onClick={()=>setQuery('')}><X size={18}/></button>}</div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por categoria">
        <button aria-pressed={!category} className={!category ? 'btn-primary shrink-0' : 'btn-secondary shrink-0'} onClick={()=>setCategory('')}>Todos <span className="opacity-70">{data.entries.length}</span></button>
        {categories.map(c=><button key={c.id} aria-pressed={Number(category)===c.id} className={Number(category)===c.id?'btn-primary shrink-0':'btn-secondary shrink-0'} onClick={()=>setCategory(String(c.id))}>{c.name}<span className="opacity-70">{data.entries.filter(p=>p.category_id===c.id).length}</span></button>)}
        <button className="btn-ghost shrink-0" onClick={()=>{setError('');setManager('category')}}><Plus size={16}/>Adicionar categoria</button>
      </div>
    </section>
    <p className="text-sm text-slate-400" aria-live="polite">{loading ? 'Carregando peças...' : `${filtered.length} peça(s) encontrada(s)`}</p>
    {!loading && !filtered.length && <div className="card p-8 text-center space-y-3"><Package className="mx-auto text-slate-400" size={32}/><p className="font-semibold">{data.entries.length ? 'Nenhuma peça encontrada' : 'Seu catálogo de peças começa aqui'}</p><p className="text-sm text-slate-400">{data.entries.length ? 'Experimente outro termo ou selecione Todos.' : 'Adicione uma categoria, uma marca e cadastre a primeira peça.'}</p><button className="btn-secondary mx-auto" onClick={begin}>Adicionar peça</button></div>}
    {groups.map(group=><section key={group.id || 'legacy'} className="space-y-3"><h3 className="font-semibold flex gap-2 items-center"><Package size={17} className="text-amber-500"/>{group.name}<span className="text-xs text-slate-400">{group.rows.length}</span></h3>
      <div className="card parts-table">
        <div className="parts-row parts-table-head text-xs text-slate-400"><span>Marca / Modelo</span><span>Peça</span><span>Características</span><span>Qualidade</span><span>Valor</span><span>Ações</span></div>
        {group.rows.map(p=><article className="parts-row" key={p.id}>
          <div className="min-w-0"><p className="font-semibold break-words">{p.model}</p><p className="text-xs text-slate-400">{p.brand}</p></div>
          <div className="text-sm break-words"><p>{p.description || group.name}</p>{p.part_code && <p className="text-xs text-slate-400">{p.part_code}</p>}</div>
          <div className="text-xs text-slate-400 break-words">{[p.version, p.assembly_type, p.frame==='with'?'Com aro':p.frame==='without'?'Sem aro':''].filter(Boolean).join(' • ') || '—'}</div>
          <div className="text-sm">{p.quality || '—'}</div>
          <div className="parts-price"><p className="text-lg font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">{formatCurrency(p.sale_price)}</p></div>
          <div className="parts-actions flex gap-1 flex-wrap"><button className="btn-ghost" aria-label={`Editar ${p.model}`} onClick={()=>{setError('');setEditing({...emptyPart,...p})}}><Pencil size={15}/>Editar</button><button className="btn-ghost text-rose-500" aria-label={`Excluir ${p.model}`} onClick={()=>{setError('');setRemoving(p)}}><Trash2 size={15}/>Excluir</button></div>
        </article>)}
      </div>
    </section>)}
    {editing && !manager && <ModalFrame className="flex items-center justify-center bg-black/60 p-4" busy={busy} onClick={()=>setEditing(null)} aria-labelledby="part-title"><form className="card parts-modal p-5 space-y-4" onSubmit={e=>{e.preventDefault();if(!selectedModel){setError('Selecione um modelo cadastrado ou use Adicionar / gerenciar modelos.');return}const payload={...editing,model_id:selectedModel.id,cost_price:Number(editing.cost_price),sale_price:Number(editing.sale_price)};mutate(()=>editing.id?api.put(`/calculators/parts/entries/${editing.id}`,payload):api.post('/calculators/parts/entries',payload),'Peça salva com sucesso.',()=>setEditing(null))}}>
      <div className="flex justify-between gap-3 items-center"><h3 id="part-title" className="font-bold text-lg">{editing.id?'Editar peça':'Adicionar peça'}</h3><button type="button" className="btn-ghost" aria-label="Fechar" onClick={()=>setEditing(null)}><X size={20}/></button></div>
      {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        {[['category_id','Categoria','category'],['brand','Marca','brand'],['quality_id','Qualidade','quality']].map(([field,label,kind])=><label key={field} className="block min-w-0"><span className="label">{label}</span><select aria-label={label} required={kind!=='quality'} className="input w-full" value={editing[field] || ''} onChange={e=>setEditing({...editing,[field]:e.target.value,...(kind==='brand'?{model:''}:{})})}><option value="">{kind==='quality'?'Não informada':'Selecione'}</option>{options(kind).map(o=><option key={o.id} value={kind==='brand'?o.name:o.id}>{o.name}</option>)}</select><button type="button" className="text-xs text-amber-600 dark:text-amber-400 mt-2 underline" onClick={()=>{setError('');setManager(kind)}}>Adicionar / gerenciar {labels[kind].toLowerCase()}</button></label>)}
        <div className="min-w-0"><ModelPicker brand={editing.brand} value={editing.model} models={data.models || []} onChange={model=>setEditing({...editing,model})}/><button type="button" className="text-xs text-amber-600 dark:text-amber-400 mt-2 underline" onClick={()=>{setError('');setManager('model')}}>Adicionar / gerenciar modelos</button></div>
        {[['description','Nome / descrição da peça'],['part_code','Código da peça (opcional)'],['version','Versão / variante (opcional)']].map(([field,label])=><label className="block" key={field}><span className="label">{label}</span><input maxLength={1000} className="input" value={editing[field]} onChange={e=>setEditing({...editing,[field]:e.target.value})}/></label>)}
      </div>
      <details open={Boolean(categories.find(c=>c.id===Number(editing.category_id))?.show_assembly) || undefined} className="rounded-xl border border-slate-200 dark:border-neutral-600 p-3"><summary className="cursor-pointer text-sm font-medium">Montagem e aro (opcionais)</summary><div className="grid sm:grid-cols-2 gap-3 mt-3"><label><span className="label">Tipo de montagem</span><input maxLength={1000} className="input" value={editing.assembly_type} onChange={e=>setEditing({...editing,assembly_type:e.target.value})}/></label><label><span className="label">Aro</span><select className="input" value={editing.frame} onChange={e=>setEditing({...editing,frame:e.target.value})}><option value="">Não se aplica / não informado</option><option value="with">Com aro</option><option value="without">Sem aro</option></select></label></div></details>
      <div className="grid sm:grid-cols-2 gap-4">{[['cost_price','Custo da peça (R$)'],['sale_price','Valor de consulta / venda (R$)']].map(([field,label])=><label key={field}><span className="label">{label}</span><input required type="number" min="0" step="0.01" className="input" value={editing[field]} onChange={e=>setEditing({...editing,[field]:e.target.value})}/></label>)}</div>
      <div className="rounded-xl bg-amber-500/10 p-3 text-sm space-y-2"><p>Preço calculado: <strong>{formatCurrency(calculatePrice(Number(editing.cost_price)||0,finance,editing.frame!=='without'))}</strong></p><p className="text-xs text-slate-400">Usa margem, risco, mão de obra, insumos e película das configurações. Revise para a categoria selecionada.</p><button type="button" className="btn-secondary" onClick={()=>setEditing({...editing,sale_price:calculatePrice(Number(editing.cost_price)||0,finance,editing.frame!=='without').toFixed(2)})}>Usar preço calculado</button></div>
      <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button><button className="btn-primary" disabled={busy}>{busy?'Salvando...':'Salvar peça'}</button></div>
    </form></ModalFrame>}
    {manager && <OptionManager kind={manager} onKind={setManager} options={data.options} models={data.models || []} initialBrand={editing?.brand} busy={busy} error={error} onClose={()=>{setManager(null);setError('')}} mutate={mutate} onDeleted={(id,kind)=>{if(kind==='category' && Number(category)===id)setCategory('')}}/>}
    {removing && <ModalFrame className="flex items-center justify-center bg-black/60 p-4" busy={busy} onClick={()=>setRemoving(null)} aria-labelledby="delete-part-title"><div className="card parts-modal p-5 space-y-4"><h3 id="delete-part-title" className="font-bold">Excluir peça?</h3><p>Excluir {removing.brand} {removing.model} — {formatCurrency(removing.sale_price)}?</p><p className="text-sm text-slate-400">Essa ação remove este registro permanentemente.</p>{error&&<p role="alert" className="text-rose-500">{error}</p>}<div className="flex justify-end gap-2"><button className="btn-secondary" disabled={busy} onClick={()=>setRemoving(null)}>Cancelar</button><button className="btn-danger" disabled={busy} onClick={()=>mutate(()=>api.delete(`/calculators/parts/entries/${removing.id}`),'Peça excluída.',()=>setRemoving(null))}>Excluir peça</button></div></div></ModalFrame>}
  </div>
}

function ModelPicker({ brand, value, models, onChange }) {
  const [open,setOpen]=useState(false)
  const [active,setActive]=useState(-1)
  const matches=models.filter(m=>normalize(m.brand)===normalize(brand) && normalize(m.name).includes(normalize(value)))
  const choose=m=>{onChange(m.name);setOpen(false);setActive(-1)}
  return <div onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setActive(-1)}}}>
    <label className="label" htmlFor="part-model-input">Modelo</label>
    <input id="part-model-input" required maxLength={1000} className="input" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="part-model-options" aria-activedescendant={open&&active>=0&&matches[active]?`part-model-option-${matches[active].id}`:undefined} placeholder={brand?'Pesquisar modelo...':'Selecione a marca primeiro'} disabled={!brand} value={value} onFocus={()=>setOpen(true)} onChange={e=>{onChange(e.target.value);setOpen(true);setActive(-1)}} onKeyDown={e=>{
      if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,matches.length-1))}
      if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,i-1))}
      if(e.key==='Enter'&&open){e.preventDefault();if(matches[active>=0?active:0])choose(matches[active>=0?active:0])}
      if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false)}
    }}/>
    {open&&<div className="mt-2 rounded-xl border border-slate-200 dark:border-neutral-600 max-h-48 overflow-y-auto" role="listbox" id="part-model-options" aria-label="Modelos da marca">
      {matches.map((m,i)=><button type="button" role="option" id={`part-model-option-${m.id}`} aria-selected={i===active} key={m.id} className={`block w-full text-left px-3 py-2.5 text-sm hover:bg-amber-500/10 ${i===active?'bg-amber-500/20':''}`} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(m)}>{m.name}</button>)}
      {!matches.length&&<p className="p-3 text-sm text-slate-400">Nenhum modelo encontrado. Use “Adicionar / gerenciar modelos”.</p>}
    </div>}
  </div>
}

function OptionManager({ kind, onKind, options, models, initialBrand, busy, error, onClose, mutate, onDeleted }) {
  const initialBrandId=options.find(o=>o.kind==='brand'&&normalize(o.name)===normalize(initialBrand))?.id || ''
  const blank=()=>({name:'',show_assembly:false,brand_id:initialBrandId})
  const [form,setForm]=useState(blank)
  const [deleting,setDeleting]=useState(null)
  const [brandFilter,setBrandFilter]=useState(initialBrandId)
  const [search,setSearch]=useState('')
  const isModel=kind==='model'
  const route=isModel?'models':'options'
  const changeKind=k=>{onKind(k);setForm(blank());setDeleting(null);setSearch('')}
  const rows=isModel?models.filter(m=>(!brandFilter||m.brand_id===Number(brandFilter))&&normalize(`${m.brand} ${m.name}`).includes(normalize(search))):options.filter(o=>o.kind===kind)
  return <ModalFrame className="flex items-center justify-center bg-black/60 p-4" busy={busy} onClick={onClose} aria-labelledby="options-title"><div className="card parts-modal p-5 space-y-4">
    <div className="flex justify-between items-center"><h3 id="options-title" className="font-bold text-lg">Gerenciar cadastros</h3><button className="btn-ghost" aria-label="Fechar gerenciamento" onClick={onClose}><X size={20}/></button></div>
    <div className="flex flex-wrap gap-2">{Object.entries(labels).map(([k,label])=><button key={k} className={kind===k?'btn-primary':'btn-secondary'} onClick={()=>changeKind(k)}>{label}</button>)}</div>
    {error&&<p role="alert" className="text-sm text-rose-500">{error}</p>}
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();mutate(()=>form.id?api.put(`/calculators/parts/${route}/${form.id}`,form):api.post(`/calculators/parts/${route}`,{...form,kind}),'Cadastro salvo.',()=>{if(isModel)setBrandFilter(form.brand_id);setForm({...blank(),brand_id:form.brand_id})})}}>
      {isModel&&<label className="block"><span className="label">Marca do modelo</span><select required className="input" value={form.brand_id} onChange={e=>setForm({...form,brand_id:e.target.value})}><option value="">Selecione</option>{options.filter(o=>o.kind==='brand').map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <label className="block"><span className="label">{isModel?'Nome do modelo':form.id?'Renomear cadastro':'Adicionar cadastro'}</span><input required maxLength={isModel?1000:100} className="input" placeholder={`Nome — ${labels[kind].toLowerCase()}`} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      {isModel&&form.id&&<p className="text-xs text-slate-400">Ao renomear, o nome será atualizado nas peças vinculadas. Seus preços serão preservados.</p>}
      {kind==='category'&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.show_assembly} onChange={e=>setForm({...form,show_assembly:e.target.checked})}/>Destacar campos de montagem e aro</label>}
      <div className="flex gap-2"><button disabled={busy} className="btn-primary">{form.id?'Salvar alteração':'Adicionar'}</button>{form.id&&<button type="button" className="btn-secondary" onClick={()=>setForm(blank())}>Cancelar edição</button>}</div>
    </form>
    {isModel&&<div className="grid sm:grid-cols-2 gap-3"><label><span className="label">Filtrar modelos por marca</span><select className="input" value={brandFilter} onChange={e=>setBrandFilter(e.target.value)}><option value="">Todas as marcas</option>{options.filter(o=>o.kind==='brand').map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label><span className="label">Pesquisar modelos</span><input className="input" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>}
    <div className="space-y-2">{rows.map(o=><div key={o.id} className="border-t border-slate-200 dark:border-neutral-600 pt-3 flex items-center justify-between gap-2"><div className="break-words min-w-0"><span>{o.name}</span>{isModel&&<p className="text-xs text-slate-400">{o.brand}</p>}</div><div className="flex shrink-0"><button className="btn-ghost" aria-label={`${isModel?'Editar':'Renomear'} ${o.name}`} onClick={()=>{setForm(o);setDeleting(null)}}><Pencil size={16}/></button><button className="btn-ghost text-rose-500" aria-label={`Excluir ${o.name}`} onClick={()=>setDeleting(o)}><Trash2 size={16}/></button></div></div>)}</div>
    {isModel&&!rows.length&&<p className="text-sm text-slate-400">Nenhum modelo cadastrado neste filtro.</p>}
    {deleting&&<div className="border border-rose-500/40 rounded-xl p-3 space-y-3"><p className="text-sm">Excluir “{deleting.name}”? Cadastros em uso não podem ser excluídos.</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>setDeleting(null)}>Cancelar</button><button disabled={busy} className="btn-danger" onClick={()=>mutate(()=>api.delete(`/calculators/parts/${route}/${deleting.id}`),'Cadastro excluído.',()=>{onDeleted(deleting.id,kind);setDeleting(null);if(form.id===deleting.id)setForm(blank())})}>Confirmar exclusão</button></div></div>}
    <button className="btn-secondary w-full" disabled={busy} onClick={onClose}>Concluir</button>
  </div></ModalFrame>
}
