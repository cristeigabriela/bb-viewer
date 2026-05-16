/** True C keywords and primitives that should never be treated as user-defined types.
 *
 *  This set deliberately excludes Win32 typedefs (DWORD, HANDLE, LPCWSTR, etc.).
 *  Those are first-class entries in `TypesData.typedefs` after bb PR #25 and
 *  resolve naturally through the typedef index. */
export const KNOWN_PRIMITIVES = new Set([
  // C language keywords
  "auto", "const", "extern", "inline", "register", "restrict", "return",
  "signed", "static", "typedef", "unsigned", "volatile",
  // C struct/union/enum keywords (appear in field type strings)
  "struct", "union", "enum",
  // C primitive types
  "void", "char", "short", "int", "long", "float", "double",
  "_Bool", "_Complex", "_Imaginary",
  // C extension types
  "__int8", "__int16", "__int32", "__int64", "wchar_t", "size_t",
  // MSVC calling-convention keywords
  "__cdecl", "__stdcall", "__fastcall", "__thiscall", "__vectorcall",
  // MSVC attributes
  "__attribute__", "__declspec", "__forceinline",
  // Other common C noise tokens
  "NULL", "TRUE", "FALSE",
]);
