import json,struct,numpy as np
def load(path):
    f=open(path,'rb').read(); jl=struct.unpack('<I',f[12:16])[0]; j=json.loads(f[20:20+jl])
    off=20+jl; bl=struct.unpack('<I',f[off:off+4])[0]; binb=f[off+8:off+8+bl]
    return j,bytearray(binb)
def save(path,j,binb):
    js=json.dumps(j,separators=(',',':')).encode()
    while len(js)%4: js+=b' '
    while len(binb)%4: binb.append(0)
    j['buffers'][0]['byteLength']=len(binb)
    js=json.dumps(j,separators=(',',':')).encode()
    while len(js)%4: js+=b' '
    tot=12+8+len(js)+8+len(binb)
    with open(path,'wb') as f:
        f.write(struct.pack('<4sII',b'glTF',2,tot)); f.write(struct.pack('<I4s',len(js),b'JSON')); f.write(js)
        f.write(struct.pack('<I4s',len(binb),b'BIN\0')); f.write(bytes(binb))
def local(n):
    if 'matrix' in n: return np.array(n['matrix']).reshape(4,4).T
    T=np.eye(4); 
    if 'translation' in n: T[:3,3]=n['translation']
    R=np.eye(4)
    if 'rotation' in n:
        x,y,z,w=n['rotation']
        R[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    S=np.diag(list(n.get('scale',[1,1,1]))+[1])
    return T@R@S
def parents(j):
    par={}
    for i,n in enumerate(j['nodes']):
        for c in n.get('children',[]): par[c]=i
    return par
def world(j,i,par=None):
    par=par or parents(j); M=local(j['nodes'][i]); k=i
    while k in par: k=par[k]; M=local(j['nodes'][k])@M
    return M
def mesh_bbox_world(j,i,par=None):
    n=j['nodes'][i]; M=world(j,i,par); lo=np.full(3,1e18); hi=np.full(3,-1e18)
    for p in j['meshes'][n['mesh']]['primitives']:
        a=j['accessors'][p['attributes']['POSITION']]; mn,mx=np.array(a['min']),np.array(a['max'])
        cs=np.array([[x,y,z,1] for x in (mn[0],mx[0]) for y in (mn[1],mx[1]) for z in (mn[2],mx[2])])
        w=(M@cs.T).T[:,:3]; lo=np.minimum(lo,w.min(0)); hi=np.maximum(hi,w.max(0))
    return lo,hi
