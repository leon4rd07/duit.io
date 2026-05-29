// src/js/pages/categories.js
import {{ state }}             from '../lib/store.js'
import {{ showToast }}         from '../lib/toast.js'
import {{ navigate }}          from '../lib/router.js'
import {{ fmt, fmtShort, fmtDate, monthKey, monthLabel }} from '../lib/utils.js'
import {{ CATEGORIES, getCatGroups, getCatObj }} from '../lib/categories.js'
import {{ AVATAR_COLORS }}     from '../lib/config.js'
import * as DB                from '../lib/supabase.js'

import {
  getAllCats, getCatGroups, getAllGroupsOrdered,
  addCategory, updateCategory, deleteCategory,
  addGroup, deleteGroup, renameGroup,
  saveGroupOrder, getGroupOrder,
  DEFAULT_CATS,
} from '../lib/categories.js'



export { renderCategoryManager }

const catFns = [
  'setCatPageType','openAddCatSheet','openEditCatSheet','closeCatSheet',
  'setCatSheetType','setCatSheetEmoji','setCatSheetColor','saveCatSheet',
  'openGroupManager','openGroupEditor','addNewGroup','renameGroup','deleteGroup',
  'handleCatDragStart','handleCatDragEnd','handleDropToGroup','handleDropBeforeItem',
  'moveCatToGroup','deleteCat',
]
catFns.forEach(name => { try { window[name] = eval(name) } catch(e) {} })
