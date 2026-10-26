import sys; sys.path.insert(0,'.')
from body import *
G=build_grid()
L=sub_mesh(G,0,G['nz']-1,0,K,1); R=sub_mesh(G,0,G['nz']-1,0,K,-1)
body=concat([L,R]); body.X=None
g=GLB(); m=Mat('paint','#e8eaec',metal=0.2,rough=0.35,clearcoat=1.0,ccrough=0.03,double=True)
g.node('body',parts=[(m,body)])
g.write(sys.argv[1])
